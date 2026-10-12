import { getBlob } from "./db/local";
import { TABLE_ORDER, TABLE_KEYS, emptyDataset, type Dataset } from "./types";

export const BACKUP_FORMAT = "fishing-tracker-backup";
export const BACKUP_VERSION = 1;

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  exported_at: string;
  data: Dataset;
  /** media id -> base64 JPEG (full size), present when photos were included */
  photos?: Record<string, string>;
}

async function blobToBase64(b: Blob): Promise<string> {
  const buf = new Uint8Array(await b.arrayBuffer());
  let s = "";
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

export async function buildBackup(ds: Dataset, includePhotos: boolean): Promise<BackupFile> {
  const file: BackupFile = { format: BACKUP_FORMAT, version: BACKUP_VERSION, exported_at: new Date().toISOString(), data: ds };
  if (includePhotos) {
    file.photos = {};
    for (const m of ds.media) {
      const b = await getBlob(`${m.id}:full`);
      if (b) file.photos[m.id] = await blobToBase64(b);
    }
  }
  return file;
}

export function parseBackup(text: string): BackupFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("INVALID_JSON");
  }
  const f = raw as Partial<BackupFile>;
  if (!f || f.format !== BACKUP_FORMAT || typeof f.data !== "object" || !f.data) throw new Error("NOT_A_BACKUP");
  if ((f.version ?? 0) > BACKUP_VERSION) throw new Error("NEWER_VERSION");
  const data = emptyDataset() as unknown as Record<string, Record<string, unknown>[]>;
  for (const t of TABLE_ORDER) {
    const rows = (f.data as unknown as Record<string, unknown>)[t];
    if (rows == null) continue;
    if (!Array.isArray(rows)) throw new Error(`BAD_TABLE:${t}`);
    for (const r of rows) {
      if (!r || typeof r !== "object") throw new Error(`BAD_ROW:${t}`);
      for (const k of TABLE_KEYS[t]) if (typeof (r as Record<string, unknown>)[k] !== "string") throw new Error(`BAD_KEY:${t}`);
    }
    data[t] = rows as Record<string, unknown>[];
  }
  return { ...(f as BackupFile), data: data as unknown as Dataset };
}

export function base64ToBlob(b64: string, type = "image/jpeg"): Blob {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type });
}

export function download(filename: string, content: Blob | string, type = "application/json") {
  const blob = typeof content === "string" ? new Blob([content], { type }) : content;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
