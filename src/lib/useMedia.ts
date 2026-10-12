"use client";

import { useEffect, useState } from "react";
import { getBlob, putBlob } from "./db/local";
import { useStore } from "./db/store";
import { supabase } from "./supabase";

const signed = new Map<string, { url: string; exp: number }>();
const objectUrls = new Map<string, string>();

/**
 * Resolve a displayable URL for a media item. Order: blob cached on this
 * device -> short-lived signed URL from private storage (thumbnails are then
 * cached locally so the gallery also works offline).
 */
export function useMediaUrl(mediaId: string | null | undefined, variant: "thumb" | "full" = "thumb"): string | null {
  const { ds } = useStore();
  const media = mediaId ? ds.media.find((m) => m.id === mediaId) : undefined;
  const [url, setUrl] = useState<string | null>(() => (mediaId ? objectUrls.get(`${mediaId}:${variant}`) ?? null : null));

  useEffect(() => {
    let alive = true;
    if (!mediaId) {
      setUrl(null);
      return;
    }
    (async () => {
      const cacheKey = `${mediaId}:${variant}`;
      const memo = objectUrls.get(cacheKey);
      if (memo) return alive && setUrl(memo);
      const blob = (await getBlob(cacheKey)) ?? (variant === "thumb" ? await getBlob(`${mediaId}:full`) : await getBlob(`${mediaId}:full`));
      if (blob) {
        const u = URL.createObjectURL(blob);
        objectUrls.set(cacheKey, u);
        return alive && setUrl(u);
      }
      const sb = supabase();
      if (!sb || !media || media.storage_path.startsWith("pending/") || media.storage_path.startsWith("local/")) return;
      const path = variant === "thumb" ? media.thumb_path ?? media.storage_path : media.storage_path;
      const hit = signed.get(path);
      if (hit && hit.exp > Date.now() + 60_000) return alive && setUrl(hit.url);
      const { data } = await sb.storage.from("media").createSignedUrl(path, 60 * 60 * 6);
      if (!data?.signedUrl) return;
      signed.set(path, { url: data.signedUrl, exp: Date.now() + 6 * 3600_000 });
      if (alive) setUrl(data.signedUrl);
      if (variant === "thumb") {
        try {
          const r = await fetch(data.signedUrl);
          if (r.ok) await putBlob(cacheKey, await r.blob());
        } catch {}
      }
    })();
    return () => {
      alive = false;
    };
  }, [mediaId, variant, media]);

  return url;
}

/** Load the full image blob (local first, then storage) — used for AI identification. */
export async function loadMediaBlob(media: { id: string; storage_path: string }): Promise<Blob | null> {
  const local = await getBlob(`${media.id}:full`);
  if (local) return local;
  const sb = supabase();
  if (!sb) return null;
  const { data } = await sb.storage.from("media").download(media.storage_path);
  return data ?? null;
}
