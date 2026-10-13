"use client";

// إحصائياتي — personal fishing profile. Every number is derived from the saved
// records each render, so edits and deletions are reflected immediately.

import Link from "next/link";
import { useMemo, useState } from "react";
import { Fish, MapPin, Ruler, Sailboat, Scale, Target, Wrench } from "lucide-react";
import { CatchRow, TripCard } from "@/components/common";
import { FilterBar } from "@/components/Filters";
import { Badge, Card, Empty, LinkButton, N, PageHeader, SectionTitle, Stat } from "@/components/ui";
import { useStore } from "@/lib/db/store";
import { useI18n } from "@/lib/i18n";
import { byLocation, byTechnique, catchLocation, catchTechnique, pct, speciesCounts, summarize, tripRows, type Filters } from "@/lib/stats";
import { dateKey } from "@/lib/time";

export default function ProfilePage() {
  const { ds, idx, hijriOffset } = useStore();
  const { t, name, num, lang } = useI18n();
  const [f, setF] = useState<Filters>({});

  const rows = useMemo(() => tripRows(ds, idx, f, hijriOffset), [ds, idx, f, hijriOffset]);
  const s = summarize(rows);
  const allTrips = ds.trips.filter((x) => x.status !== "cancelled");
  const catches = useMemo(
    () =>
      ds.catches.filter((c) => {
        const d = dateKey(c.caught_at);
        if (f.from && d < f.from) return false;
        if (f.to && d > f.to) return false;
        if (f.speciesId && c.species_id !== f.speciesId) return false;
        if (f.techniqueId && catchTechnique(c, idx) !== f.techniqueId) return false;
        if (f.locationId && catchLocation(c, idx) !== f.locationId) return false;
        return true;
      }),
    [ds.catches, f, idx],
  );
  const sp = speciesCounts(catches).filter((x) => x.speciesId);
  const heaviest = [...catches].filter((c) => c.weight_kg != null).sort((a, b) => Number(a.weight_is_estimate) - Number(b.weight_is_estimate) || b.weight_kg! - a.weight_kg!)[0];
  const longest = [...catches].filter((c) => c.length_cm != null).sort((a, b) => Number(a.length_is_estimate) - Number(b.length_is_estimate) || b.length_cm! - a.length_cm!)[0];
  const locs = byLocation(rows).groups.filter((g) => g.trips >= 3).sort((a, b) => (b.catchesPerTrip ?? 0) - (a.catchesPerTrip ?? 0));
  const tech = byTechnique(rows).groups.sort((a, b) => b.trips - a.trips)[0];
  const recentTrips = [...ds.trips].sort((a, b) => b.started_at.localeCompare(a.started_at)).slice(0, 4);
  const recentCatches = [...catches].sort((a, b) => b.caught_at.localeCompare(a.caught_at)).slice(0, 5);
  const balool = ds.species.find((x) => x.name_ar === "بالول");

  return (
    <>
      <PageHeader title={t("إحصائياتي", "My stats")} section="stats" />
      <FilterBar value={f} onChange={setF} fields={["date", "species", "location", "technique"]} />

      {!ds.trips.length && !ds.catches.length ? (
        <div className="mt-6">
          <Empty icon="📊" title={t("لا توجد سجلات بعد", "No records yet")} action={<LinkButton href="/trip/edit">{t("رحلة جديدة", "New trip")}</LinkButton>}>
            {t("ستظهر هنا إحصائياتك من رحلاتك وصيدك الحقيقي.", "Your statistics from real trips and catches will appear here.")}
          </Empty>
        </div>
      ) : (
        <>
          <SectionTitle>{t("الرحلات", "Trips")}</SectionTitle>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat icon={<Sailboat className="size-3.5" />} label={t("كل الرحلات", "All trips")} value={allTrips.length} sub={t("بدون الملغاة", "excl. cancelled")} />
            <Stat label={t("منتهية", "Completed")} value={s.trips} />
            <Stat label={t("ناجحة", "Successful")} value={s.successful} sub={t(`نسبة ${pct(s.successRate)}`, `${pct(s.successRate)} rate`)} />
            <Stat label={t("بدون صيد", "No catch")} value={s.blank} />
          </div>

          <SectionTitle>{t("الصيد", "Catches")}</SectionTitle>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat icon={<Fish className="size-3.5" />} label={t("إجمالي الصيدات", "Total catches")} value={catches.length} sub={t(`${num(s.catchesPerTrip, 2)} لكل رحلة منتهية`, `${num(s.catchesPerTrip, 2)} per completed trip`)} />
            <Stat label={t("أنواع مختلفة", "Unique species")} value={new Set(catches.map((c) => c.species_id).filter(Boolean)).size} />
            <Stat
              label={t("الأكثر صيداً", "Most caught")}
              value={<span className="text-lg">{sp[0] ? name(idx.speciesById.get(sp[0].speciesId!)) : "—"}</span>}
              sub={sp[0] ? `×${sp[0].count}` : undefined}
            />
            <Stat
              icon={<Scale className="size-3.5" />}
              label={t("أثقل سمكة", "Heaviest")}
              value={heaviest ? `${heaviest.weight_kg} ${t("كغ", "kg")}` : "—"}
              sub={heaviest ? `${name(heaviest.species_id ? idx.speciesById.get(heaviest.species_id) : null)}${heaviest.weight_is_estimate ? t(" (تقديري)", " (est.)") : ""}` : t("لا أوزان مسجلة", "no weights recorded")}
            />
            <Stat
              icon={<Ruler className="size-3.5" />}
              label={t("أطول سمكة", "Longest")}
              value={longest ? `${longest.length_cm} ${t("سم", "cm")}` : "—"}
              sub={longest ? `${name(longest.species_id ? idx.speciesById.get(longest.species_id) : null)}${longest.length_is_estimate ? t(" (تقديري)", " (est.)") : ""}` : t("لا أطوال مسجلة", "no lengths recorded")}
            />
            <Stat
              icon={<MapPin className="size-3.5" />}
              label={t("أكثر موقع إنتاجاً", "Most productive spot")}
              value={<span className="text-lg">{locs[0] ? idx.locById.get(locs[0].key)?.name : "—"}</span>}
              sub={locs[0] ? <>{num(locs[0].catchesPerTrip, 2)} {t("سمكة/رحلة", "fish/trip")} <N n={locs[0].trips} /></> : t("يحتاج ٣ رحلات على الأقل لموقع", "needs 3+ trips at a spot")}
            />
            <Stat
              icon={<Wrench className="size-3.5" />}
              label={t("أكثر طريقة استخداماً", "Most used technique")}
              value={<span className="text-lg">{tech ? name(idx.techById.get(tech.key)) : "—"}</span>}
              sub={tech ? t(`${tech.trips} رحلة · نجاح ${pct(tech.successRate)}`, `${tech.trips} trips · ${pct(tech.successRate)} success`) : undefined}
            />
          </div>

          {balool && (
            <Link href={`/species?id=${balool.id}`} className="mt-3 flex items-center justify-between rounded-[var(--radius-card)] border border-teal/30 bg-teal/5 p-4">
              <span className="flex items-center gap-2 font-semibold">
                <Target className="size-5 text-teal" /> {t("صفحة البالول", "Balool page")}
              </span>
              <Badge tone="teal">×{ds.catches.filter((c) => c.species_id === balool.id).length}</Badge>
            </Link>
          )}

          {sp.length > 0 && (
            <>
              <SectionTitle action={<Link className="text-sm text-teal" href="/collection">{t("كل الأنواع", "All species")}</Link>}>{t("أنواعي", "My species")}</SectionTitle>
              <div className="flex flex-wrap gap-2">
                {sp.slice(0, 10).map((x) => (
                  <Link key={x.speciesId} href={`/species?id=${x.speciesId}`}>
                    <Badge className="py-1.5 text-sm">
                      {name(idx.speciesById.get(x.speciesId!))} ×{x.count}
                    </Badge>
                  </Link>
                ))}
              </div>
            </>
          )}

          <SectionTitle action={<Link className="text-sm text-teal" href="/trips">{t("الكل", "All")}</Link>}>{t("آخر الرحلات", "Recent trips")}</SectionTitle>
          <div className="space-y-2">
            {recentTrips.map((x) => (
              <TripCard key={x.id} trip={x} />
            ))}
          </div>
          {recentCatches.length > 0 && (
            <>
              <SectionTitle action={<Link className="text-sm text-teal" href="/catches">{t("الكل", "All")}</Link>}>{t("آخر الصيدات", "Recent catches")}</SectionTitle>
              <Card className="p-2">
                {recentCatches.map((c) => (
                  <CatchRow key={c.id} c={c} showTrip />
                ))}
              </Card>
            </>
          )}
          <p className="mt-3 px-1 text-xs text-muted">
            {t(
              "الإحصائيات تُحسب من سجلاتك عند كل فتح، فأي تعديل أو حذف يظهر فوراً. الرحلات المخططة والجارية والملغاة لا تدخل في نسب النجاح.",
              "Statistics are computed from your records every time, so edits and deletions show immediately. Planned, active and cancelled trips are not part of success rates.",
            )}
            {lang === "ar" ? "" : ""}
          </p>
        </>
      )}
    </>
  );
}
