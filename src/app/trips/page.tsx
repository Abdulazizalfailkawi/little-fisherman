"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { TripCard } from "@/components/common";
import { FilterBar } from "@/components/Filters";
import { Choice, Empty, Input, LinkButton, N, PageHeader } from "@/components/ui";
import { useStore } from "@/lib/db/store";
import { useI18n } from "@/lib/i18n";
import { matches } from "@/lib/normalize";
import { pct, summarize, tripRows, type Filters } from "@/lib/stats";
import { fmtDate, monthKey } from "@/lib/time";

export default function TripsPage() {
  const { ds, idx, hijriOffset } = useStore();
  const { t, lang, name } = useI18n();
  const [f, setF] = useState<Filters>({});
  const [result, setResult] = useState<"all" | "success" | "blank">("all");

  const rows = useMemo(() => {
    const r = tripRows(ds, idx, f, hijriOffset, true).reverse();
    return r.filter((x) => {
      if (result === "success" && !x.success) return false;
      if (result === "blank" && (x.success || x.trip.status === "draft")) return false;
      // Species filter: trips that caught it or targeted it ("success" = caught that species).
      if (f.speciesId && !x.success && x.trip.target_species_id !== f.speciesId) return false;
      if (f.q) {
        const loc = x.trip.location_id ? idx.locById.get(x.trip.location_id)?.name : "";
        const sp = x.allCatches.map((c) => (c.species_id ? `${idx.speciesById.get(c.species_id)?.name_ar} ${idx.speciesById.get(c.species_id)?.name_en}` : "")).join(" ");
        const tech = x.trip.technique_id ? name(idx.techById.get(x.trip.technique_id)) : "";
        if (!matches(f.q, x.trip.title, x.trip.notes, loc, sp, tech, x.trip.lure_bait, ...x.allCatches.map((c) => c.notes))) return false;
      }
      return true;
    });
  }, [ds, idx, f, hijriOffset, result, name]);

  const completed = rows.filter((r) => r.trip.status === "completed");
  const s = summarize(completed);
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = monthKey(r.trip.started_at);
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }

  return (
    <>
      <PageHeader
        title={t("الرحلات", "Trips")}
        subtitle={t(`${s.trips} رحلة · ${s.catches} سمكة · نجاح ${pct(s.successRate)}`, `${s.trips} trips · ${s.catches} fish · ${pct(s.successRate)} success`)}
        actions={
          <LinkButton href="/trip/edit" size="sm" className="!px-2.5" aria-label="new">
            <Plus className="size-5" />
          </LinkButton>
        }
      />
      <div className="space-y-3">
        <Input placeholder={t("بحث في الرحلات والملاحظات والمواقع…", "Search trips, notes, spots…")} value={f.q ?? ""} onChange={(e) => setF({ ...f, q: e.target.value || undefined })} />
        <FilterBar value={f} onChange={setF} />
        <Choice
          value={result}
          allowClear={false}
          onChange={(v) => v && setResult(v)}
          options={[
            { value: "all", label: t("الكل", "All") },
            { value: "success", label: t("ناجحة", "Successful") },
            { value: "blank", label: t("بدون صيد", "No catch") },
          ]}
        />
      </div>

      {rows.length === 0 ? (
        <div className="mt-6">
          <Empty icon="🛶" title={ds.trips.length ? t("لا توجد نتائج", "No matching trips") : t("لا توجد رحلات بعد", "No trips yet")} action={!ds.trips.length && <LinkButton href="/quick">{t("ابدأ", "Start")}</LinkButton>} />
        </div>
      ) : (
        [...groups.entries()].map(([k, list]) => {
          const ms = summarize(list.filter((r) => r.trip.status === "completed"));
          return (
            <section key={k} className="mt-5">
              <div className="sticky top-[calc(var(--safe-top)+4.25rem)] z-10 -mx-4 mb-2 flex items-baseline justify-between bg-abyss/80 px-5 py-1.5 backdrop-blur">
                <h2 className="font-semibold">{fmtDate(`${k}-15T12:00:00Z`, lang, { day: undefined, month: "long", year: "numeric" })}</h2>
                <span className="text-xs text-muted">
                  {ms.catches} {t("سمكة", "fish")} · {pct(ms.successRate)} <N n={ms.trips} />
                </span>
              </div>
              <div className="space-y-2">
                {list.map((r) => (
                  <TripCard key={r.trip.id} trip={r.trip} />
                ))}
              </div>
            </section>
          );
        })
      )}
    </>
  );
}
