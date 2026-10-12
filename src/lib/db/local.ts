// IndexedDB persistence: one object store per table, plus an outbox of
// pending changes, a blob store for photos and a small key/value store.
import { openDB, type IDBPDatabase } from "idb";
import { TABLE_ORDER, emptyDataset, rowKey, type Dataset, type TableName, type Tables } from "../types";

const DB_NAME = "fishing-tracker";
const DB_VERSION = 1;

export interface OutboxEntry {
  seq?: number;
  table: TableName;
  op: "upsert" | "delete" | "upload";
  key: string;
  row: Record<string, unknown>;
  createdAt: string;
  attempts: number;
  error?: string;
}

let dbp: Promise<IDBPDatabase> | null = null;

export function db(): Promise<IDBPDatabase> {
  if (!dbp) {
    dbp = openDB(DB_NAME, DB_VERSION, {
      upgrade(d) {
        for (const t of TABLE_ORDER) if (!d.objectStoreNames.contains(t)) d.createObjectStore(t);
        if (!d.objectStoreNames.contains("outbox")) d.createObjectStore("outbox", { keyPath: "seq", autoIncrement: true });
        if (!d.objectStoreNames.contains("blobs")) d.createObjectStore("blobs");
        if (!d.objectStoreNames.contains("meta")) d.createObjectStore("meta");
      },
    });
  }
  return dbp;
}

export async function loadAll(): Promise<Dataset> {
  const d = await db();
  const ds = emptyDataset();
  const tx = d.transaction(TABLE_ORDER, "readonly");
  await Promise.all(
    TABLE_ORDER.map(async (t) => {
      (ds as unknown as Record<string, unknown[]>)[t] = await tx.objectStore(t).getAll();
    }),
  );
  await tx.done;
  return ds;
}

export async function putRows<T extends TableName>(table: T, rows: Tables[T][]): Promise<void> {
  const d = await db();
  const tx = d.transaction(table, "readwrite");
  for (const r of rows) await tx.store.put(r, rowKey(table, r));
  await tx.done;
}

export async function deleteKeys(table: TableName, keys: string[]): Promise<void> {
  const d = await db();
  const tx = d.transaction(table, "readwrite");
  for (const k of keys) await tx.store.delete(k);
  await tx.done;
}

/** Replace the full contents of every table (used after a server pull / restore). */
export async function replaceAll(ds: Dataset): Promise<void> {
  const d = await db();
  const tx = d.transaction(TABLE_ORDER, "readwrite");
  for (const t of TABLE_ORDER) {
    const s = tx.objectStore(t);
    await s.clear();
    for (const r of (ds as unknown as Record<string, Record<string, unknown>[]>)[t]) await s.put(r, rowKey(t, r as never));
  }
  await tx.done;
}

// ---- outbox ---------------------------------------------------------------
export async function enqueue(entries: OutboxEntry[]): Promise<void> {
  if (!entries.length) return;
  const d = await db();
  const tx = d.transaction("outbox", "readwrite");
  for (const e of entries) await tx.store.add(e);
  await tx.done;
}
export async function outboxAll(): Promise<OutboxEntry[]> {
  return (await db()).getAll("outbox");
}
export async function outboxRemove(seqs: number[]): Promise<void> {
  const d = await db();
  const tx = d.transaction("outbox", "readwrite");
  for (const s of seqs) await tx.store.delete(s);
  await tx.done;
}
export async function outboxUpdate(e: OutboxEntry): Promise<void> {
  await (await db()).put("outbox", e);
}
export async function outboxClear(): Promise<void> {
  await (await db()).clear("outbox");
}

// ---- blobs ----------------------------------------------------------------
export async function putBlob(key: string, blob: Blob): Promise<void> {
  await (await db()).put("blobs", blob, key);
}
export async function getBlob(key: string): Promise<Blob | undefined> {
  return (await db()).get("blobs", key);
}
export async function deleteBlob(key: string): Promise<void> {
  await (await db()).delete("blobs", key);
}

// ---- meta -----------------------------------------------------------------
export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db()).get("meta", key);
}
export async function setMeta(key: string, value: unknown): Promise<void> {
  await (await db()).put("meta", value, key);
}

/** Wipe everything (sign-out from a different account, "delete local data"). */
export async function wipeLocal(): Promise<void> {
  const d = await db();
  const stores = [...TABLE_ORDER, "outbox", "blobs", "meta"];
  const tx = d.transaction(stores, "readwrite");
  for (const s of stores) await tx.objectStore(s).clear();
  await tx.done;
}
