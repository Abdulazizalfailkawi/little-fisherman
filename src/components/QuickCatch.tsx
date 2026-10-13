"use client";

// Floating "+" button: one tap opens the camera, the photo becomes a catch
// straight away (linked to the active trip when there is one, otherwise a
// stand-alone catch). Species, weight etc. can be completed afterwards.

import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { useStore } from "@/lib/db/store";
import { newCatch } from "@/lib/factory";
import { useI18n } from "@/lib/i18n";
import { isActiveStatus } from "@/lib/types";
import { useToast } from "./Toast";

const HIDDEN = ["/catch/edit", "/trip/edit", "/login"];

export function QuickCatch() {
  const { ds, idx, save, addPhoto } = useStore();
  const { t } = useI18n();
  const toast = useToast();
  const path = usePathname();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  if (HIDDEN.some((p) => path.startsWith(p))) return null;

  const onFile = async (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    setBusy(true);
    try {
      const media = await addPhoto(f);
      const active = ds.trips.find((x) => isActiveStatus(x.status)) ?? null;
      let spot: string | null = null;
      try {
        spot = localStorage.getItem("ft.marineSpot");
      } catch {}
      const location_id = active?.location_id ?? (spot && idx.locById.has(spot) ? spot : null);
      const c = newCatch(active, {
        photo_media_id: media.id,
        identification_status: "unidentified",
        location_id,
        technique_id: active?.technique_id ?? null,
      });
      await save("catches", c);
      const where = active ? active.title || (active.location_id && idx.locById.get(active.location_id)?.name) || t("الرحلة الجارية", "the active trip") : null;
      toast(
        active
          ? t(`حُفظت الصيدة في رحلة «${where}»`, `Catch saved to trip “${where}”`)
          : t("حُفظت الصيدة بدون رحلة — تجدها في «رحلاتي وصيدي» وإحصائياتي", "Catch saved without a trip — see Trips & catches and your stats"),
        { label: t("أكمل التفاصيل", "Add details"), href: `/catch/edit?id=${c.id}` },
      );
    } catch {
      toast(t("تعذرت قراءة الصورة، جرّب مرة ثانية", "Couldn't read that photo, try again"));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <>
      <button
        type="button"
        aria-label={t("تصوير سريع لصيدة", "Quick catch photo")}
        disabled={busy}
        onClick={() => input.current?.click()}
        className="no-print fixed end-4 bottom-[calc(var(--safe-bottom)+5rem)] z-40 grid size-14 place-items-center rounded-full bg-teal text-navy shadow-xl shadow-black/40 active:scale-95 disabled:opacity-70"
      >
        {busy ? <Loader2 className="size-7 animate-spin" /> : <Plus className="size-8" strokeWidth={3} />}
      </button>
      <input ref={input} type="file" accept="image/*" capture="environment" hidden onChange={(e) => onFile(e.target.files)} />
    </>
  );
}
