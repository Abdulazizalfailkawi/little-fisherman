// Photo handling optimised for phones: big camera photos (often 4–12 MB)
// are resized to max 1600px JPEG (~300–600 KB) plus a 400px thumbnail
// before they are stored or uploaded. Duplicates are detected by hashing
// the original file bytes, so picking the same photo twice reuses it.

import { sha256Hex } from "./ids";

export const MAX_EDGE = 1600;
export const THUMB_EDGE = 400;
export const AI_EDGE = 1024;
export const MAX_VIDEO_BYTES = 25 * 1024 * 1024;

export interface ProcessedImage {
  sha256: string;
  full: Blob;
  thumb: Blob;
  width: number;
  height: number;
  mime: string;
  takenAt: string | null;
}

async function decode(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      /* fall through to <img> (older Safari) */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

function dims(src: ImageBitmap | HTMLImageElement) {
  return "naturalWidth" in src ? { w: src.naturalWidth, h: src.naturalHeight } : { w: src.width, h: src.height };
}

async function resize(src: ImageBitmap | HTMLImageElement, maxEdge: number, quality: number): Promise<{ blob: Blob; w: number; h: number }> {
  const { w, h } = dims(src);
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not available");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src as CanvasImageSource, 0, 0, cw, ch);
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", quality));
  if (!blob) throw new Error("Could not encode image");
  return { blob, w: cw, h: ch };
}

export async function processImage(file: File): Promise<ProcessedImage> {
  if (!file.type.startsWith("image/") && !/\.(heic|heif|jpe?g|png|webp)$/i.test(file.name)) {
    throw new Error("Not an image");
  }
  const buf = await file.arrayBuffer();
  const sha256 = await sha256Hex(buf);
  const src = await decode(file);
  const full = await resize(src, MAX_EDGE, 0.82);
  const thumb = await resize(src, THUMB_EDGE, 0.72);
  if ("close" in src) src.close();
  return {
    sha256,
    full: full.blob,
    thumb: thumb.blob,
    width: full.w,
    height: full.h,
    mime: "image/jpeg",
    takenAt: file.lastModified ? new Date(file.lastModified).toISOString() : null,
  };
}

export async function processVideo(file: File): Promise<{ sha256: string; blob: Blob; mime: string }> {
  if (file.size > MAX_VIDEO_BYTES) throw new Error("VIDEO_TOO_LARGE");
  const sha256 = await sha256Hex(await file.arrayBuffer());
  const mime = file.type === "video/quicktime" ? "video/quicktime" : "video/mp4";
  return { sha256, blob: file, mime };
}

/** Smaller JPEG (base64, no prefix) for sending to the AI endpoint. */
export async function imageForAi(blob: Blob): Promise<string> {
  const src = await decode(blob);
  const { blob: small } = await resize(src, AI_EDGE, 0.8);
  if ("close" in src) src.close();
  const buf = new Uint8Array(await small.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}
