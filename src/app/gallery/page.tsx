"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { Photo } from "@/components/common";
import { Choice, Empty, Input, PageHeader } from "@/components/ui";
import { useStore } from "@/lib/db/store";
import { useI18n } from "@/lib/i18n";
import { matches } from "@/lib/normalize";
import { fmtDate } from "@/lib/time";

export default function Page() {
  return (
    <Suspense>
      <Gallery />
    </Suspense>
  );
}

interface Item {
  mediaId: string;
  href: string;
  at: string;
  label: string;
  search: string[];
  unidentified: boolean;
}

function Gallery() {
  const sp = useSearchParams();
  const { ds, idx } = useStore();
  const { t, lang, name } = useI18n();
  const [q, setQ] = useState("");
  const [mode, setMode] = useState<"all" | "catches" | "unidentified">(sp.get("unidentified") ? "unidentified" : "all");

  const items = useMemo(() => {
    const out: Item[] = [];
    for (const c of ds.catches) {
      const s = c.species_id ? idx.speciesById.get(c.species_id) : null;
      const trip = idx.tripById.get(c.trip_id);
      const loc = trip?.location_id ? idx.locById.get(trip.location_id)?.name : "";
      if (mode === "unidentified" && c.species_id) continue;
      if (!c.photo_media_id) {
        if (mode === "unidentified")
          out.push({ mediaId: "", href: `/catch?id=${c.id}`, at: c.caught_at, label: t("بدون صورة", "No photo"), search: [loc ?? "", c.notes ?? ""], unidentified: true });
        continue;
      }
      out.push({
        mediaId: c.photo_media_id,
        href: `/catch?id=${c.id}`,
        at: c.caught_at,
        label: s ? name(s) : t("غير محدد", "Unidentified"),
        search: [s?.name_ar ?? "", s?.name_en ?? "", ...(s?.aliases ?? []), loc ?? "", c.notes ?? "", trip?.title ?? ""],
        unidentified: !c.species_id,
      });
    }
    if (mode === "all")
      for (const m of ds.trip_media) {
        const trip = idx.tripById.get(m.trip_id);
        if (!trip) continue;
        out.push({
          mediaId: m.media_id,
          href: `/trip?id=${trip.id}`,
          at: trip.started_at,
          label: trip.title || t("رحلة", "Trip"),
          search: [trip.title ?? "", trip.notes ?? "", trip.location_id ? idx.locById.get(trip.location_id)?.name ?? "" : ""],
          unidentified: false,
        });
      }
    return out.filter((i) => !q || matches(q, i.label, ...i.search)).sort((a, b) => b.at.localeCompare(a.at));
  }, [ds, idx, mode, q, name, t]);

  return (
    <>
      <PageHeader title={t("معرض الصور", "Photo gallery")} subtitle={`${items.length}`} back="/more" />
      <div className="space-y-3">
        <Input placeholder={t("ابحث بالنوع أو الموقع…", "Search by species or spot…")} value={q} onChange={(e) => setQ(e.target.value)} />
        <Choice
          value={mode}
          allowClear={false}
          onChange={(v) => v && setMode(v)}
          options={[
            { value: "all", label: t("الكل", "All") },
            { value: "catches", label: t("الصيد", "Catches") },
            { value: "unidentified", label: t("بدون نوع", "Unidentified") },
          ]}
        />
      </div>
      {items.length === 0 ? (
        <div className="mt-6">
          <Empty icon="📷" title={t("لا توجد صور", "No photos")} />
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-3 gap-1.5 sm:grid-cols-4">
          {items.map((i, k) => (
            <Link key={i.mediaId + k} href={i.href} className="group relative aspect-square overflow-hidden rounded-xl">
              <Photo mediaId={i.mediaId || null} className="size-full" />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-1.5 pt-4 text-[10px] leading-tight">
                <div className="truncate font-medium">{i.label}</div>
                <div className="text-white/70">{fmtDate(i.at, lang)}</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
