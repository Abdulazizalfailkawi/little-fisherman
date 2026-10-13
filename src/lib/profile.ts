"use client";

// Optional profile of a signed-in user: name, short bio, profile photo.
// Stored in the user's own row of `public.profiles` (RLS: only that user).

import { useCallback, useEffect, useState } from "react";
import { useStore } from "./db/store";
import { supabase } from "./supabase";

export interface Profile {
  display_name: string | null;
  bio: string | null;
  avatar_media_id: string | null;
}

const EMPTY: Profile = { display_name: null, bio: null, avatar_media_id: null };
const key = (uid: string) => `ft.profile:${uid}`;

export function useProfile() {
  const { user, mode } = useStore();
  const uid = mode === "cloud" ? user?.id ?? null : null;
  const [profile, setProfile] = useState<Profile>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) {
      setProfile(EMPTY);
      return;
    }
    try {
      const c = localStorage.getItem(key(uid));
      if (c) setProfile({ ...EMPTY, ...JSON.parse(c) });
    } catch {}
    const sb = supabase();
    if (!sb) return;
    setLoading(true);
    void sb
      .from("profiles")
      .select("display_name,bio,avatar_media_id")
      .eq("id", uid)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setProfile({ ...EMPTY, ...data });
          try {
            localStorage.setItem(key(uid), JSON.stringify(data));
          } catch {}
        }
      })
      .then(
        () => setLoading(false),
        () => setLoading(false),
      );
  }, [uid]);

  const save = useCallback(
    async (patch: Partial<Profile>): Promise<string | null> => {
      if (!uid) return "NOT_SIGNED_IN";
      const next = { ...profile, ...patch };
      setProfile(next);
      try {
        localStorage.setItem(key(uid), JSON.stringify(next));
      } catch {}
      const sb = supabase();
      if (!sb) return "OFFLINE";
      const { error: e } = await sb.from("profiles").upsert({ id: uid, ...next });
      setError(e ? e.message : null);
      return e ? e.message : null;
    },
    [uid, profile],
  );

  return { profile, loading, error, save, signedIn: !!uid };
}
