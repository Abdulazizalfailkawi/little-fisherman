"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { uuid } from "../ids";
import { processImage, processVideo } from "../media";
import { BUILTIN_TECHNIQUES, SEED_SPECIES } from "../seed";
import { buildIndex, type Index } from "../stats";
import { supabase, supabaseConfigured } from "../supabase";
import {
  TABLE_ORDER,
  emptyDataset,
  rowKey,
  type Dataset,
  type Media,
  type Species,
  type TableName,
  type Tables,
  type Technique,
} from "../types";
import * as local from "./local";
import { SyncError, cascadeDelete, overlay, planMerge, pullAll, pushOutbox, upsertInto } from "./sync";

export type Mode = "cloud" | "local";
type Row = Record<string, unknown>;

interface SessionUser {
  id: string;
  email: string | null;
}

interface StoreValue {
  ready: boolean;
  ds: Dataset;
  idx: Index;
  mode: Mode | null;
  user: SessionUser | null;
  online: boolean;
  syncing: boolean;
  pending: number;
  pendingKeys: Set<string>;
  failed: local.OutboxEntry[];
  lastSyncAt: string | null;
  syncError: string | null;
  hijriOffset: number;
  setHijriOffset: (n: number) => Promise<void>;
  save: <T extends TableName>(table: T, rows: Tables[T] | Tables[T][]) => Promise<void>;
  remove: <T extends TableName>(table: T, rows: Tables[T] | Tables[T][]) => Promise<void>;
  addPhoto: (file: File) => Promise<Media>;
  addVideo: (file: File) => Promise<Media>;
  syncNow: () => Promise<void>;
  retryFailed: () => Promise<void>;
  discardFailed: (seq: number) => Promise<void>;
  enterLocalMode: () => Promise<void>;
  onSignedIn: () => Promise<void>;
  signOut: (opts?: { keepLocal?: boolean }) => Promise<void>;
  replaceDataset: (ds: Dataset, toPush?: Dataset) => Promise<void>;
  isPending: (table: TableName, key: string) => boolean;
}

const Ctx = createContext<StoreValue | null>(null);

const now = () => new Date().toISOString();
const NO_UPDATED_AT: TableName[] = ["trip_equipment", "catch_equipment", "trip_media", "user_achievements"];

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [ds, setDs] = useState<Dataset>(emptyDataset);
  const dsRef = useRef(ds);
  dsRef.current = ds;
  const [mode, setMode] = useState<Mode | null>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const [user, setUser] = useState<SessionUser | null>(null);
  const userRef = useRef(user);
  userRef.current = user;
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [outbox, setOutbox] = useState<local.OutboxEntry[]>([]);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [hijriOffset, setHijriOffsetState] = useState(0);
  const syncLock = useRef(false);
  const pulledThisSession = useRef(false);

  const refreshOutbox = useCallback(async () => setOutbox(await local.outboxAll()), []);

  const commit = useCallback((next: Dataset) => {
    dsRef.current = next;
    setDs(next);
  }, []);

  // ---- seeding ------------------------------------------------------------
  const seedIfEmpty = useCallback(async () => {
    const cur = dsRef.current;
    const ts = now();
    const techs: Technique[] = cur.techniques.length
      ? []
      : BUILTIN_TECHNIQUES.map((t) => ({ id: uuid(), ...t, is_builtin: true, created_at: ts, updated_at: ts }));
    const species: Species[] = cur.species.length
      ? []
      : SEED_SPECIES.map((s) => ({
          id: uuid(),
          name_ar: s.name_ar,
          name_en: s.name_en,
          scientific_name: s.scientific_name,
          aliases: s.aliases,
          family: s.family,
          notes: s.notes ?? null,
          cover_media_id: null,
          is_builtin: true,
          created_at: ts,
          updated_at: ts,
        }));
    if (techs.length) await saveRows("techniques", techs);
    if (species.length) await saveRows("species", species);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- core write path ----------------------------------------------------
  const saveRows = useCallback(
    async <T extends TableName>(table: T, rows: Tables[T][]) => {
      if (!rows.length) return;
      const ts = now();
      const stamped = rows.map((r) => {
        const o = { ...(r as unknown as Row) };
        if (!o.created_at) o.created_at = ts;
        // join tables + user_achievements have no updated_at column
        if (NO_UPDATED_AT.includes(table)) delete o.updated_at;
        else o.updated_at = ts;
        return o as unknown as Tables[T];
      });
      await local.putRows(table, stamped);
      commit(upsertInto(dsRef.current, table, stamped as unknown as Row[]));
      if (modeRef.current === "cloud") {
        await local.enqueue(
          stamped.map((r) => ({
            table,
            op: "upsert" as const,
            key: rowKey(table, r),
            row: r as unknown as Row,
            createdAt: ts,
            attempts: 0,
          })),
        );
        await refreshOutbox();
        scheduleSync();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [commit, refreshOutbox],
  );

  const removeRows = useCallback(
    async <T extends TableName>(table: T, rows: Tables[T][]) => {
      if (!rows.length) return;
      const { ds: next, deleted, modified } = cascadeDelete(dsRef.current, table, rows as unknown as Row[]);
      for (const d of deleted) await local.deleteKeys(d.table, d.keys);
      for (const m of modified) await local.putRows(m.table, m.rows as never);
      if (table === "media") for (const r of rows as Media[]) {
        await local.deleteBlob(`${r.id}:full`);
        await local.deleteBlob(`${r.id}:thumb`);
      }
      commit(next);
      if (modeRef.current === "cloud") {
        // The server applies the same cascades, so only the root rows are sent.
        await local.enqueue(
          rows.map((r) => ({
            table,
            op: "delete" as const,
            key: rowKey(table, r),
            row: r as unknown as Row,
            createdAt: now(),
            attempts: 0,
          })),
        );
        await refreshOutbox();
        scheduleSync();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [commit, refreshOutbox],
  );

  // ---- sync -----------------------------------------------------------------
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncNowRef = useRef<() => Promise<void>>(async () => {});
  const scheduleSync = useCallback(() => {
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => void syncNowRef.current(), 800);
  }, []);

  const syncNow = useCallback(async () => {
    const sb = supabase();
    const u = userRef.current;
    if (modeRef.current !== "cloud" || !sb || !u) return;
    if (syncLock.current) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    syncLock.current = true;
    setSyncing(true);
    try {
      const pushed = await pushOutbox(sb, u.id);
      if (pushed.updatedMedia.length) {
        await local.putRows("media", pushed.updatedMedia);
        commit(upsertInto(dsRef.current, "media", pushed.updatedMedia as unknown as Row[]));
      }
      if (pushed.stoppedOffline) {
        setSyncError("offline");
        return;
      }
      const server = await pullAll(sb);
      const pending = await local.outboxAll();
      const merged = overlay(server, pending);
      await local.replaceAll(merged);
      commit(merged);
      pulledThisSession.current = true;
      const { data: prof } = await sb.from("profiles").select("hijri_offset").maybeSingle();
      if (prof && typeof prof.hijri_offset === "number") {
        setHijriOffsetState(prof.hijri_offset);
        await local.setMeta("hijriOffset", prof.hijri_offset);
      }
      if (!merged.techniques.length && !merged.species.length) await seedIfEmpty();
      const t = now();
      setLastSyncAt(t);
      await local.setMeta("lastSyncAt", t);
      setSyncError(null);
    } catch (e) {
      if (e instanceof SyncError && e.kind === "auth") {
        await sb.auth.refreshSession().catch(() => undefined);
        setSyncError("auth");
      } else setSyncError(e instanceof SyncError && e.kind === "offline" ? "offline" : String((e as Error).message ?? e));
    } finally {
      syncLock.current = false;
      setSyncing(false);
      await refreshOutbox();
    }
  }, [commit, refreshOutbox, seedIfEmpty]);
  syncNowRef.current = syncNow;

  // ---- boot -------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const loaded = await local.loadAll();
      if (cancelled) return;
      commit(loaded);
      setHijriOffsetState((await local.getMeta<number>("hijriOffset")) ?? 0);
      setLastSyncAt((await local.getMeta<string>("lastSyncAt")) ?? null);
      await refreshOutbox();
      const owner = await local.getMeta<string>("owner");
      const sb = supabase();
      if (sb) {
        const { data } = await sb.auth.getSession();
        const s = data.session;
        if (s) {
          if (owner && owner !== s.user.id && owner !== "local") {
            await local.wipeLocal();
            commit(emptyDataset());
          }
          setUser({ id: s.user.id, email: s.user.email ?? null });
          userRef.current = { id: s.user.id, email: s.user.email ?? null };
          if (owner === "local") {
            // Signed in on a device that was used without an account: handled by onSignedIn().
            setMode("local");
            modeRef.current = "local";
          } else {
            await local.setMeta("owner", s.user.id);
            setMode("cloud");
            modeRef.current = "cloud";
          }
        } else if (owner === "local") {
          setMode("local");
          modeRef.current = "local";
          await seedIfEmpty();
        }
      } else {
        // No backend configured: this-device-only mode.
        await local.setMeta("owner", "local");
        setMode("local");
        modeRef.current = "local";
        await seedIfEmpty();
      }
      setReady(true);
      if (modeRef.current === "cloud") void syncNowRef.current();
    })();
    return () => {
      cancelled = true;
    };
  }, [commit, refreshOutbox, seedIfEmpty]);

  // ---- connectivity -----------------------------------------------------------
  useEffect(() => {
    const up = () => {
      setOnline(true);
      void syncNowRef.current();
    };
    const down = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    const vis = () => document.visibilityState === "visible" && void syncNowRef.current();
    document.addEventListener("visibilitychange", vis);
    const iv = setInterval(() => void syncNowRef.current(), 5 * 60_000);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
      document.removeEventListener("visibilitychange", vis);
      clearInterval(iv);
    };
  }, []);

  // ---- auth transitions ---------------------------------------------------------
  const onSignedIn = useCallback(async () => {
    const sb = supabase();
    if (!sb) return;
    const { data } = await sb.auth.getSession();
    const s = data.session;
    if (!s) return;
    const u = { id: s.user.id, email: s.user.email ?? null };
    setUser(u);
    userRef.current = u;
    const owner = await local.getMeta<string>("owner");
    if (owner === "local" && dsRef.current.trips.length + dsRef.current.catches.length > 0) {
      // Upload this device's data into the account, merging with what is there.
      const server = await pullAll(sb);
      const plan = planMerge(dsRef.current, server);
      const entries: local.OutboxEntry[] = [];
      for (const step of plan)
        for (const r of step.rows)
          entries.push({
            table: step.table,
            op: step.table === "media" ? "upload" : "upsert",
            key: rowKey(step.table, r as never),
            row: r,
            createdAt: now(),
            attempts: 0,
          });
      await local.outboxClear();
      await local.enqueue(entries);
    } else if (owner && owner !== u.id) {
      await local.wipeLocal();
      commit(emptyDataset());
    }
    await local.setMeta("owner", u.id);
    setMode("cloud");
    modeRef.current = "cloud";
    await refreshOutbox();
    await syncNowRef.current();
  }, [commit, refreshOutbox]);

  const signOut = useCallback(
    async (opts?: { keepLocal?: boolean }) => {
      const sb = supabase();
      if (sb) await sb.auth.signOut().catch(() => undefined);
      if (!opts?.keepLocal) {
        await local.wipeLocal();
        commit(emptyDataset());
      }
      setUser(null);
      userRef.current = null;
      setMode(null);
      modeRef.current = null;
      await refreshOutbox();
    },
    [commit, refreshOutbox],
  );

  const enterLocalMode = useCallback(async () => {
    await local.setMeta("owner", "local");
    setMode("local");
    modeRef.current = "local";
    await seedIfEmpty();
  }, [seedIfEmpty]);

  // ---- media --------------------------------------------------------------------------
  const storeMedia = useCallback(
    async (sha: string, full: Blob, thumb: Blob | null, info: Partial<Media> & { mime_type: string; kind: Media["kind"] }) => {
      const existing = dsRef.current.media.find((m) => m.sha256 === sha);
      if (existing) return existing; // duplicate photo: reuse
      const ts = now();
      const m: Media = {
        id: uuid(),
        storage_path: `pending/${sha}`,
        thumb_path: null,
        sha256: sha,
        kind: info.kind,
        mime_type: info.mime_type,
        width: info.width ?? null,
        height: info.height ?? null,
        bytes: full.size,
        taken_at: info.taken_at ?? null,
        created_at: ts,
        updated_at: ts,
      };
      await local.putBlob(`${m.id}:full`, full);
      if (thumb) await local.putBlob(`${m.id}:thumb`, thumb);
      await local.putRows("media", [m]);
      commit(upsertInto(dsRef.current, "media", [m as unknown as Row]));
      if (modeRef.current === "cloud") {
        await local.enqueue([{ table: "media", op: "upload", key: m.id, row: m as unknown as Row, createdAt: ts, attempts: 0 }]);
        await refreshOutbox();
        scheduleSync();
      }
      return m;
    },
    [commit, refreshOutbox, scheduleSync],
  );

  const addPhoto = useCallback(
    async (file: File) => {
      const p = await processImage(file);
      return storeMedia(p.sha256, p.full, p.thumb, {
        kind: "photo",
        mime_type: p.mime,
        width: p.width,
        height: p.height,
        taken_at: p.takenAt,
      });
    },
    [storeMedia],
  );

  const addVideo = useCallback(
    async (file: File) => {
      const v = await processVideo(file);
      return storeMedia(v.sha256, v.blob, null, { kind: "video", mime_type: v.mime });
    },
    [storeMedia],
  );

  // ---- misc ---------------------------------------------------------------------------
  const setHijriOffset = useCallback(async (n: number) => {
    setHijriOffsetState(n);
    await local.setMeta("hijriOffset", n);
    const sb = supabase();
    if (sb && userRef.current && modeRef.current === "cloud") {
      await sb.from("profiles").upsert({ id: userRef.current.id, hijri_offset: n }).then(
        () => undefined,
        () => undefined,
      );
    }
  }, []);

  /**
   * Replace the local dataset (backup restore). In cloud mode only `toPush`
   * (the restored rows) is uploaded; photos are uploaded when their file is
   * on this device, otherwise only the record is sent (the file is assumed to
   * already be in storage from the original device).
   */
  const replaceDataset = useCallback(
    async (next: Dataset, toPush?: Dataset) => {
      await local.replaceAll(next);
      commit(next);
      if (modeRef.current === "cloud") {
        const src = toPush ?? next;
        const entries: local.OutboxEntry[] = [];
        for (const t of TABLE_ORDER)
          for (const r of (src as unknown as Record<string, Row[]>)[t]) {
            const hasBlob = t === "media" ? !!(await local.getBlob(`${r.id}:full`)) : false;
            if (t === "media" && !hasBlob && String(r.storage_path ?? "").startsWith("pending/")) continue;
            entries.push({
              table: t,
              op: t === "media" && hasBlob ? "upload" : "upsert",
              key: rowKey(t, r as never),
              row: r,
              createdAt: now(),
              attempts: 0,
            });
          }
        await local.enqueue(entries);
        await refreshOutbox();
        scheduleSync();
      }
    },
    [commit, refreshOutbox, scheduleSync],
  );

  const retryFailed = useCallback(async () => {
    for (const e of await local.outboxAll())
      if (e.error) {
        delete e.error;
        await local.outboxUpdate(e);
      }
    await refreshOutbox();
    await syncNowRef.current();
  }, [refreshOutbox]);

  const discardFailed = useCallback(
    async (seq: number) => {
      await local.outboxRemove([seq]);
      await refreshOutbox();
    },
    [refreshOutbox],
  );

  const idx = useMemo(() => buildIndex(ds), [ds]);
  const pendingKeys = useMemo(() => new Set(outbox.map((e) => `${e.table}|${e.key}`)), [outbox]);

  const value: StoreValue = {
    ready,
    ds,
    idx,
    mode,
    user,
    online,
    syncing,
    pending: outbox.filter((e) => !e.error).length,
    pendingKeys,
    failed: outbox.filter((e) => e.error),
    lastSyncAt,
    syncError,
    hijriOffset,
    setHijriOffset,
    save: (table, rows) => saveRows(table, (Array.isArray(rows) ? rows : [rows]) as never),
    remove: (table, rows) => removeRows(table, (Array.isArray(rows) ? rows : [rows]) as never),
    addPhoto,
    addVideo,
    syncNow,
    retryFailed,
    discardFailed,
    enterLocalMode,
    onSignedIn,
    signOut,
    replaceDataset,
    isPending: (table, key) => pendingKeys.has(`${table}|${key}`),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): StoreValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStore outside provider");
  return v;
}

export { supabaseConfigured };
