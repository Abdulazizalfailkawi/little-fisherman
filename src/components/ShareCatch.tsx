"use client";

// "شارك هذي الصيدة" — opens the community composer pre-filled from a catch
// (photo, fish, weight). Signed-out users are sent to sign in first.

import Link from "next/link";
import { useState } from "react";
import { Share2 } from "lucide-react";
import { getBlob } from "@/lib/db/local";
import { useStore } from "@/lib/db/store";
import { useI18n } from "@/lib/i18n";
import type { Catch } from "@/lib/types";
import { CommunityComposer, type ComposerPrefill } from "./CommunityComposer";
import { useToast } from "./Toast";
import { Button } from "./ui";

export function ShareCatch({ c }: { c: Catch }) {
  const { mode, idx } = useStore();
  const { t } = useI18n();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [prefill, setPrefill] = useState<ComposerPrefill | undefined>();

  if (mode !== "cloud")
    return (
      <Link href="/account" className="mt-2 flex items-center justify-center gap-2 rounded-2xl border border-line bg-surface-2 px-4 py-3 text-sm font-medium">
        <Share2 className="size-5 text-ocean" /> {t("سجّل دخولك عشان تشارك الصيدة في المجتمع", "Sign in to share this catch with the community")}
      </Link>
    );

  return (
    <>
      <Button
        variant="secondary"
        className="mt-2 w-full"
        onClick={async () => {
          let photo: Blob | null = null;
          if (c.photo_media_id) photo = (await getBlob(`${c.photo_media_id}:full`)) ?? null;
          setPrefill({ photo, species: c.species_id ? idx.speciesById.get(c.species_id)?.name_ar : undefined, weight: c.weight_kg, catchId: c.id });
          setOpen(true);
        }}
      >
        <Share2 className="size-5" /> {t("شارك هذي الصيدة في المجتمع", "Share this catch with the community")}
      </Button>
      <CommunityComposer open={open} onClose={() => setOpen(false)} prefill={prefill} onPosted={() => toast(t("تم النشر في المجتمع", "Posted to the community"))} />
    </>
  );
}
