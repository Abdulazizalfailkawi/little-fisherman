"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DualDate, Photo } from "@/components/common";
import { FilterBar } from "@/components/Filters";
import { Badge, Choice, Empty, Input, PageHeader } from "@/components/ui";
import { MOON_EMOJI } from "@/lib/astro";
import { useStore } from "@/lib/db/store";
import { hijriForDateKey, parseHijri } from "@/lib/hijri";
import { MOON_LABEL, TIDE_LABEL, useI18n } from "@/lib/i18n";
import { catchEnv } from "@/lib/marine/env";
import { readWindUnit } from "@/lib/marine/units";
import { matches } from "@/lib/normalize";
import { catchLocation, catchTechnique, type Filters } from "@/lib/stats";
import { catchSummary } from "@/lib/summary";
import { dateKey } from "@/lib/time";

export default function CatchHistoryPage() {
  const { ds, idx, hijriOffset } = useStore();
  const { t, lang, name } = useI18n();
  const [f, setF] = useState<Filters>({});
  const [sort, setSort] = useState<"new" | "old">("new");
  const [unlinked, setUnlinked] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("unlinked")) setUnlinked(true);
  }, []);
  const unit = readWindUnit();

  const items = useMemo(() => {
    return ds.catches
      .map((c) => ({ c, env: catchEnv(ds, c) }))
      .filter(({ c, env }) => {
        if (unlinked && c.trip_id) return false;
        const day = dateKey(c.caught_at);
        if (f.from && day < f.from) return false;
        if (f.to && day > f.to) return false;
        if (f.speciesId && c.species_id !== f.speciesId) return false;
        if (f.techniqueId && catchTechnique(c, idx) !== f.techniqueId) return false;
        if (f.locationId && catchLocation(c, idx) !== f.locationId) return false;
        if (f.moon && env.moon?.value !== f.moon) return false;
        if (f.tide && env.tidePhase?.value !== f.tide) return false;
        if (f.hijriMonth) {
          const h = parseHijri(c.hijri_date_override) ?? hijriForDateKey(day, hijriOffset);
          if (h.month !== f.hijriMonth) return false;
        }
        if (f.q) {
          const sp = c.species_id ? idx.speciesById.get(c.species_id) : null;
          if (!matches(f.q, sp?.name_ar, sp?.name_en, ...(sp?.aliases ?? []), c.notes, c.lure_bait, idx.tripById.get(c.trip_id ?? "")?.notes)) return false;
        }
        return true;
      })
      .sort((a, b) => (sort === "new" ? b.c.caught_at.localeCompare(a.c.caught_at) : a.c.caught_at.localeCompare(b.c.caught_at)));
  }, [ds, idx, f, sort, hijriOffset, unlinked]);

  return (
    <>
      <PageHeader section="trips" title={t("سجل الصيد", "Catch history")} subtitle={t(`${items.length} صيدة`, `${items.length} catches`)} />
      <div className="space-y-3">
        <Input placeholder={t("ابحث بالنوع أو الملاحظات…", "Search species or notes…")} value={f.q ?? ""} onChange={(e) => setF({ ...f, q: e.target.value || undefined })} />
        <FilterBar value={f} onChange={setF} />
        {unlinked && (
          <button className="text-xs text-warn underline" onClick={() => setUnlinked(false)}>
            {t("تعرض الصيدات غير المرتبطة برحلة فقط — إظهار الكل", "Showing catches without a trip only — show all")}
          </button>
        )}
        <Choice
          value={sort}
          allowClear={false}
          onChange={(v) => v && setSort(v)}
          options={[
            { value: "new", label: t("الأحدث", "Newest") },
            { value: "old", label: t("الأقدم", "Oldest") },
          ]}
        />
      </div>
      {items.length === 0 ? (
        <div className="mt-6">
          <Empty icon="🐟" title={t("لا توجد صيدات", "No catches")} />
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {items.map(({ c, env }) => {
            const sp = c.species_id ? idx.speciesById.get(c.species_id) : null;
            const locId = catchLocation(c, idx);
            const techId = catchTechnique(c, idx);
            const s = catchSummary(ds, idx, c, lang, unit, hijriOffset);
            return (
              <Link key={c.id} href={`/catch?id=${c.id}`} className="flex gap-3 rounded-[var(--radius-card)] border border-line/70 bg-surface/80 p-3 hover:bg-surface-2">
                <Photo mediaId={c.photo_media_id} className="size-20 shrink-0 rounded-2xl" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold">{sp ? name(sp) : t("غير محدد", "Unidentified")}</span>
                    {s.nth && <Badge tone="teal">#{s.nth}</Badge>}
                  </div>
                  <DualDate iso={c.caught_at} override={c.hijri_date_override ?? undefined} className="block truncate text-xs text-ink-2" />
                  <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
                    {locId && <Badge>{idx.locById.get(locId)?.name}</Badge>}
                    {techId && <Badge tone="ocean">{name(idx.techById.get(techId))}</Badge>}
                    {env.moon && (
                      <Badge>
                        {MOON_EMOJI[env.moon.value]} {MOON_LABEL[env.moon.value][lang]}
                      </Badge>
                    )}
                    {env.tidePhase && <Badge>🌊 {TIDE_LABEL[env.tidePhase.value][lang]}</Badge>}
                  </div>
                  {s.short && <div className="mt-1 truncate text-xs text-muted">{s.short}</div>}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
