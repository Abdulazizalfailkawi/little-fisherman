// Synchronisation between IndexedDB and Supabase.
//
// Model: local-first. Every change is applied locally and appended to an
// outbox. The outbox is pushed in order (parents are always enqueued before
// the children that reference them). Records carry client-generated UUIDs,
// so retrying a push after a dropped connection can never create duplicates
// (upsert on primary key). A pull replaces local tables with the server
// copy and then re-applies any still-pending local changes on top.

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeName } from "../normalize";
import {
  TABLE_KEYS,
  TABLE_ORDER,
  UPSERT_CONFLICT,
  emptyDataset,
  rowKey,
  type Dataset,
  type Media,
  type TableName,
} from "../types";
import { getBlob, outboxAll, outboxRemove, outboxUpdate, type OutboxEntry } from "./local";

type Row = Record<string, unknown>;
type DsRecord = Record<string, Row[]>;

// ---------------------------------------------------------------------------
// Local cascade rules — mirror the FK actions in the SQL schema
// ---------------------------------------------------------------------------
const CASCADE: Partial<Record<TableName, { table: TableName; col: string }[]>> = {
  trips: [
    { table: "catches", col: "trip_id" },
    { table: "trip_equipment", col: "trip_id" },
    { table: "trip_media", col: "trip_id" },
    { table: "trip_targets", col: "trip_id" },
    { table: "environment_observations", col: "trip_id" },
  ],
  catches: [
    { table: "catch_equipment", col: "catch_id" },
    { table: "catch_media", col: "catch_id" },
    { table: "environment_observations", col: "catch_id" },
  ],
  equipment: [
    { table: "trip_equipment", col: "equipment_id" },
    { table: "catch_equipment", col: "equipment_id" },
  ],
  media: [
    { table: "trip_media", col: "media_id" },
    { table: "catch_media", col: "media_id" },
  ],
};
// Species removal also removes it from trip targets (FK on delete cascade).
CASCADE.species = [{ table: "trip_targets", col: "species_id" }];

const SET_NULL: Partial<Record<TableName, { table: TableName; col: string }[]>> = {
  species: [
    { table: "catches", col: "species_id" },
    { table: "catches", col: "ai_species_id" },
    { table: "trips", col: "target_species_id" },
    { table: "goals", col: "species_id" },
  ],
  locations: [
    { table: "trips", col: "location_id" },
    { table: "catches", col: "location_id" },
  ],
  techniques: [
    { table: "trips", col: "technique_id" },
    { table: "catches", col: "technique_id" },
    { table: "goals", col: "technique_id" },
  ],
  media: [
    { table: "catches", col: "photo_media_id" },
    { table: "species", col: "cover_media_id" },
    { table: "equipment", col: "photo_media_id" },
  ],
};

/**
 * Remove rows and everything that depends on them. Returns the new dataset
 * plus the list of (table, row) pairs that were deleted or modified, so the
 * caller can persist exactly those.
 */
export function cascadeDelete(
  ds: Dataset,
  table: TableName,
  rows: Row[],
): { ds: Dataset; deleted: { table: TableName; keys: string[] }[]; modified: { table: TableName; rows: Row[] }[] } {
  const next = { ...ds } as unknown as DsRecord;
  const deleted: { table: TableName; keys: string[] }[] = [];
  const modifiedMap = new Map<TableName, Map<string, Row>>();

  const del = (t: TableName, victims: Row[]) => {
    if (!victims.length) return;
    const keys = new Set(victims.map((r) => rowKey(t, r as never)));
    next[t] = next[t].filter((r) => !keys.has(rowKey(t, r as never)));
    deleted.push({ table: t, keys: [...keys] });
    const ids = new Set(victims.map((r) => r.id as string).filter(Boolean));
    if (!ids.size) return;
    for (const c of CASCADE[t] ?? []) del(c.table, next[c.table].filter((r) => ids.has(r[c.col] as string)));
    for (const s of SET_NULL[t] ?? []) {
      next[s.table] = next[s.table].map((r) => {
        if (!ids.has(r[s.col] as string)) return r;
        const nr = { ...r, [s.col]: null };
        const m = modifiedMap.get(s.table) ?? new Map();
        m.set(rowKey(s.table, nr as never), nr);
        modifiedMap.set(s.table, m);
        return nr;
      });
    }
  };
  del(table, rows);
  const modified = [...modifiedMap.entries()].map(([t, m]) => ({ table: t, rows: [...m.values()] }));
  return { ds: next as unknown as Dataset, deleted, modified };
}

export function upsertInto(ds: Dataset, table: TableName, rows: Row[]): Dataset {
  const cur = (ds as unknown as DsRecord)[table];
  const map = new Map(cur.map((r) => [rowKey(table, r as never), r]));
  for (const r of rows) map.set(rowKey(table, r as never), r);
  return { ...ds, [table]: [...map.values()] } as Dataset;
}

/** Re-apply pending local changes on top of a server snapshot. */
export function overlay(server: Dataset, entries: OutboxEntry[]): Dataset {
  let ds = server;
  for (const e of [...entries].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))) {
    if (e.op === "delete") ds = cascadeDelete(ds, e.table, [e.row]).ds;
    else ds = upsertInto(ds, e.table, [e.row]);
  }
  return ds;
}

// ---------------------------------------------------------------------------
// Server I/O
// ---------------------------------------------------------------------------
const LOCAL_ONLY_COLUMNS = ["user_id", "name_ar_key"];

function clean(row: Row): Row {
  const r = { ...row };
  for (const c of LOCAL_ONLY_COLUMNS) delete r[c];
  return r;
}

export async function pullAll(sb: SupabaseClient): Promise<Dataset> {
  const ds = emptyDataset() as unknown as DsRecord;
  for (const t of TABLE_ORDER) {
    const rows: Row[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb
        .from(t)
        .select("*")
        .order(TABLE_KEYS[t][0])
        .range(from, from + 999);
      if (error) throw new SyncError(error.message, classify(error));
      rows.push(...(data as Row[]).map(clean));
      if (!data || data.length < 1000) break;
    }
    ds[t] = rows;
  }
  return ds as unknown as Dataset;
}

export class SyncError extends Error {
  constructor(
    message: string,
    public kind: "offline" | "auth" | "data",
  ) {
    super(message);
  }
}

function classify(err: { message?: string; code?: string; status?: number } | null): "offline" | "auth" | "data" {
  const msg = err?.message ?? "";
  if ((typeof navigator !== "undefined" && !navigator.onLine) || /failed to fetch|networkerror|load failed|network request failed|fetch failed/i.test(msg))
    return "offline";
  if (err?.status === 401 || err?.code === "PGRST301" || /jwt/i.test(msg)) return "auth";
  return "data";
}

export interface PushResult {
  pushed: number;
  failed: number;
  stoppedOffline: boolean;
  updatedMedia: Media[];
}

/** Push pending outbox entries in order. Never throws for data errors. */
export async function pushOutbox(sb: SupabaseClient, uid: string): Promise<PushResult> {
  const entries = (await outboxAll()).filter((e) => !e.error).sort((a, b) => a.seq! - b.seq!);
  const res: PushResult = { pushed: 0, failed: 0, stoppedOffline: false, updatedMedia: [] };

  const fail = async (e: OutboxEntry, msg: string) => {
    e.error = msg;
    e.attempts++;
    await outboxUpdate(e);
    res.failed++;
  };

  let i = 0;
  while (i < entries.length) {
    const e = entries[i];

    if (e.op === "upload") {
      const r = await pushMedia(sb, uid, e);
      if (r === "offline") {
        res.stoppedOffline = true;
        return res;
      }
      if (typeof r === "string") await fail(e, r);
      else {
        await outboxRemove([e.seq!]);
        res.pushed++;
        res.updatedMedia.push(r);
      }
      i++;
      continue;
    }

    // Group consecutive entries with the same table + op into one request.
    let j = i + 1;
    while (j < entries.length && j - i < 200 && entries[j].table === e.table && entries[j].op === e.op) j++;
    const group = entries.slice(i, j);
    const err = await sendGroup(sb, e.table, e.op as "upsert" | "delete", group);
    if (!err) {
      await outboxRemove(group.map((g) => g.seq!));
      res.pushed += group.length;
    } else {
      const kind = classify(err);
      if (kind === "offline") {
        res.stoppedOffline = true;
        return res;
      }
      if (kind === "auth") throw new SyncError(err.message ?? "auth", "auth");
      // Find the bad entries by sending them one at a time.
      for (const g of group) {
        const e1 = await sendGroup(sb, g.table, g.op as "upsert" | "delete", [g]);
        if (!e1) {
          await outboxRemove([g.seq!]);
          res.pushed++;
        } else if (classify(e1) === "offline") {
          res.stoppedOffline = true;
          return res;
        } else await fail(g, e1.message ?? "error");
      }
    }
    i = j;
  }
  return res;
}

async function sendGroup(
  sb: SupabaseClient,
  table: TableName,
  op: "upsert" | "delete",
  group: OutboxEntry[],
): Promise<{ message?: string; code?: string; status?: number } | null> {
  try {
    if (op === "upsert") {
      // Keep only the latest version of each row within this batch.
      const map = new Map<string, Row>();
      for (const g of group) map.set(g.key, clean(g.row));
      const { error, status } = await sb.from(table).upsert([...map.values()], { onConflict: UPSERT_CONFLICT[table] });
      return error ? { ...error, status } : null;
    }
    const keys = TABLE_KEYS[table];
    if (keys.length === 1 && keys[0] === "id") {
      const { error, status } = await sb
        .from(table)
        .delete()
        .in(
          "id",
          group.map((g) => g.row.id as string),
        );
      return error ? { ...error, status } : null;
    }
    for (const g of group) {
      const match: Record<string, unknown> = {};
      for (const k of keys) match[k] = g.row[k];
      const { error, status } = await sb.from(table).delete().match(match);
      if (error) return { ...error, status };
    }
    return null;
  } catch (ex) {
    return { message: String((ex as Error)?.message ?? ex) };
  }
}

async function pushMedia(sb: SupabaseClient, uid: string, e: OutboxEntry): Promise<Media | string | "offline"> {
  const m = e.row as unknown as Media;
  const full = await getBlob(`${m.id}:full`);
  if (!full) return "Photo file is missing on this device";
  const thumb = await getBlob(`${m.id}:thumb`);
  const ext = m.mime_type === "image/png" ? "png" : m.mime_type.startsWith("video/") ? (m.mime_type === "video/mp4" ? "mp4" : "mov") : "jpg";
  const path = `${uid}/${m.sha256}.${ext}`;
  const thumbPath = thumb ? `${uid}/${m.sha256}_t.jpg` : null;
  const bucket = sb.storage.from("media");
  try {
    const up = await bucket.upload(path, full, { upsert: true, contentType: m.mime_type, cacheControl: "31536000" });
    if (up.error) return classify(up.error) === "offline" ? "offline" : up.error.message;
    if (thumb && thumbPath) {
      const ut = await bucket.upload(thumbPath, thumb, { upsert: true, contentType: "image/jpeg", cacheControl: "31536000" });
      if (ut.error) return classify(ut.error) === "offline" ? "offline" : ut.error.message;
    }
  } catch (ex) {
    return classify({ message: String(ex) }) === "offline" ? "offline" : String(ex);
  }
  const row: Media = { ...m, storage_path: path, thumb_path: thumbPath };
  const { error } = await sb.from("media").upsert(clean(row as unknown as Row), { onConflict: "id" });
  if (error) return classify(error) === "offline" ? "offline" : error.message;
  return row;
}

// ---------------------------------------------------------------------------
// Merge a "this device only" dataset into an account that may already have data
// ---------------------------------------------------------------------------
/**
 * Re-points local references at existing server rows that represent the same
 * thing (species by Arabic/English name, techniques by code, locations by
 * name) and returns the local rows that still need uploading, in FK order.
 */
export function planMerge(local: Dataset, server: Dataset): { table: TableName; rows: Row[] }[] {
  const spMap = new Map<string, string>();
  const serverSp = new Map<string, string>();
  for (const s of server.species) {
    serverSp.set("ar:" + normalizeName(s.name_ar), s.id);
    if (s.name_en) serverSp.set("en:" + normalizeName(s.name_en), s.id);
  }
  for (const s of local.species) {
    const hit = serverSp.get("ar:" + normalizeName(s.name_ar)) ?? (s.name_en ? serverSp.get("en:" + normalizeName(s.name_en)) : undefined);
    if (hit) spMap.set(s.id, hit);
  }
  const techMap = new Map<string, string>();
  const serverTech = new Map(server.techniques.map((t) => [t.code, t.id]));
  for (const t of local.techniques) if (serverTech.has(t.code)) techMap.set(t.id, serverTech.get(t.code)!);
  const locMap = new Map<string, string>();
  const serverLoc = new Map(server.locations.map((l) => [normalizeName(l.name), l.id]));
  for (const l of local.locations) if (serverLoc.has(normalizeName(l.name))) locMap.set(l.id, serverLoc.get(normalizeName(l.name))!);
  const mediaMap = new Map<string, string>();
  const serverMedia = new Map(server.media.map((m) => [m.sha256, m.id]));
  for (const m of local.media) if (serverMedia.has(m.sha256)) mediaMap.set(m.id, serverMedia.get(m.sha256)!);

  const remap = (r: Row): Row => {
    const o = { ...r };
    for (const c of ["species_id", "ai_species_id", "target_species_id"]) if (o[c] && spMap.has(o[c] as string)) o[c] = spMap.get(o[c] as string);
    if (o.technique_id && techMap.has(o.technique_id as string)) o.technique_id = techMap.get(o.technique_id as string);
    if (o.location_id && locMap.has(o.location_id as string)) o.location_id = locMap.get(o.location_id as string);
    for (const c of ["photo_media_id", "cover_media_id", "media_id"]) if (o[c] && mediaMap.has(o[c] as string)) o[c] = mediaMap.get(o[c] as string);
    return o;
  };
  const skip: Partial<Record<TableName, Map<string, string>>> = {
    species: spMap,
    techniques: techMap,
    locations: locMap,
    media: mediaMap,
  };
  const serverAch = new Set(server.user_achievements.map((a) => a.achievement_code));
  const out: { table: TableName; rows: Row[] }[] = [];
  for (const t of TABLE_ORDER) {
    let rows = (local as unknown as DsRecord)[t];
    const sk = skip[t];
    if (sk) rows = rows.filter((r) => !sk.has(r.id as string));
    if (t === "user_achievements") rows = rows.filter((r) => !serverAch.has(r.achievement_code as string));
    out.push({ table: t, rows: rows.map(remap) });
  }
  return out;
}
