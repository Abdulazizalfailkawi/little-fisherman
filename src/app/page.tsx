"use client";

import Link from "next/link";
import { useMemo } from "react";
import { BarChart3, CalendarDays, Clock, Fish, Flame, Plus, Ruler, Sailboat, Scale, Target, Trophy } from "lucide-react";
import { DualDate, Photo, TripCard } from "@/components/common";
import { Badge, Card, Empty, LinkButton, PageHeader, Progress, SectionTitle, Stat, N } from "@/components/ui";
import { evaluateAchievements, nextMilestone } from "@/lib/achievements";
import { useStore } from "@/lib/db/store";
import { goalProgress } from "@/lib/goals";
import { useI18n } from "@/lib/i18n";
import { byTechnique, pct, records, speciesCounts, summarize, tripRows, weeklyTripStreak } from "@/lib/stats";
import { kwParts } from "@/lib/time";

export default function Dashboard() {
  const { ds, idx } = useStore();
  const { t, name, num } = useI18n();

  const rows = useMemo(() => tripRows(ds, idx), [ds, idx]);
  const sum = useMemo(() => summarize(rows), [rows]);
  const rec = useMemo(() => records(rows, ds.catches), [rows, ds.catches]);
  const drafts = ds.trips.filter((x) => x.status === "draft").sort((a, b) => b.started_at.localeCompare(a.started_at));
  const top = speciesCounts(ds.catches).find((s) => s.speciesId);
  const favTech = byTechnique(rows).groups.sort((a, b) => b.trips - a.trips)[0];
  const streak = weeklyTripStreak(ds.trips);
  const ach = useMemo(() => evaluateAchievements(ds, idx, rows), [ds, idx, rows]);
  const next = nextMilestone(ach);
  const goals = ds.goals.filter((g) => g.status === "active").slice(0, 3);

  const now = kwParts(new Date());
  const monthRows = rows.filter((r) => {
    const p = kwParts(r.trip.started_at);
    return p.year === now.year && p.month === now.month;
  });
  const yearRows = rows.filter((r) => kwParts(r.trip.started_at).year === now.year);
  const mSum = summarize(monthRows);
  const ySum = summarize(yearRows);
  const recent = [...ds.trips].sort((a, b) => b.started_at.localeCompare(a.started_at)).slice(0, 5);
  const heavy = rec.heaviest.measured ?? rec.heaviest.estimated;
  const long = rec.longest.measured ?? rec.longest.estimated;

  return (
    <>
      <PageHeader title={t("الصياد الصغير", "Little Fisherman")} subtitle={<DualDate iso={new Date().toISOString()} />} />

      {drafts.map((d) => (
        <Card key={d.id} className="mb-3 border-warn/40 bg-warn/5">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs text-warn">{t("رحلة جارية", "Trip in progress")}</div>
              <div className="truncate font-semibold">{d.title || (d.location_id && idx.locById.get(d.location_id)?.name) || t("رحلة صيد", "Fishing trip")}</div>
              <div className="text-xs text-muted">
                {(idx.catchesByTrip.get(d.id) ?? []).length} {t("سمكة حتى الآن", "fish so far")}
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <LinkButton href={`/catch/edit?trip=${d.id}`} variant="teal" size="md">
                <Fish className="size-5" /> {t("سمكة", "Fish")}
              </LinkButton>
              <LinkButton href={`/trip?id=${d.id}`} variant="secondary">
                {t("فتح", "Open")}
              </LinkButton>
            </div>
          </div>
        </Card>
      ))}

      <div className="grid grid-cols-5 gap-2">
        {[
          { href: "/trip/edit?start=1", icon: Sailboat, label: t("رحلة جديدة", "New trip") },
          { href: "/quick?fish=1", icon: Fish, label: t("سجّل سمكة", "Log fish") },
          { href: "/collection", icon: Trophy, label: t("مجموعتي", "Collection") },
          { href: "/stats", icon: BarChart3, label: t("الإحصائيات", "Stats") },
          { href: "/calendar", icon: CalendarDays, label: t("التقويم", "Calendar") },
        ].map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-2xl border border-line/70 bg-surface/80 px-1 text-center text-[11px] text-ink-2 hover:bg-surface-2"
          >
            <a.icon className="size-6 text-teal" />
            {a.label}
          </Link>
        ))}
      </div>

      {ds.trips.length === 0 ? (
        <div className="mt-6">
          <Empty
            icon="🌊"
            title={t("ابدأ أول رحلة", "Start your first trip")}
            action={
              <div className="flex flex-col items-center gap-2">
                <LinkButton href="/trip/edit?start=1" size="lg">
                  <Plus className="size-5" /> {t("رحلة جديدة", "New trip")}
                </LinkButton>
                <Link href="/settings#demo" className="text-sm text-teal">
                  {t("أو جرّب بيانات تجريبية", "or try demo data")}
                </Link>
              </div>
            }
          >
            {t(
              "سجّل كل رحلة — حتى الرحلات بدون صيد — لتحصل على إحصائيات صادقة عن صيدك.",
              "Log every trip — including blank ones — to get honest statistics about your fishing.",
            )}
          </Empty>
        </div>
      ) : (
        <>
          <SectionTitle>{t("ملخص", "Overview")}</SectionTitle>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat icon={<Sailboat className="size-3.5" />} label={t("الرحلات", "Trips")} value={sum.trips} sub={drafts.length ? t(`+${drafts.length} جارية`, `+${drafts.length} in progress`) : undefined} />
            <Stat icon={<Fish className="size-3.5" />} label={t("إجمالي الأسماك", "Fish caught")} value={ds.catches.length} sub={t(`${sum.speciesCount} نوع`, `${sum.speciesCount} species`)} />
            <Stat
              icon={<Target className="size-3.5" />}
              label={t("نسبة نجاح الرحلات", "Trip success rate")}
              value={pct(sum.successRate)}
              sub={t(`${sum.successful} ناجحة · ${sum.blank} بدون صيد`, `${sum.successful} successful · ${sum.blank} blank`)}
            />
            <Stat icon={<Clock className="size-3.5" />} label={t("ساعات الصيد", "Fishing hours")} value={num(sum.hours, 0)} sub={sum.catchesPerHour != null ? t(`${num(sum.catchesPerHour, 2)} سمكة/ساعة`, `${num(sum.catchesPerHour, 2)} fish/hour`) : undefined} />
            <Stat icon={<Fish className="size-3.5" />} label={t("الأكثر صيداً", "Most caught")} value={<span className="text-lg">{top ? name(idx.speciesById.get(top.speciesId!)) : "—"}</span>} sub={top ? `×${top.count}` : undefined} />
            <Stat
              icon={<Flame className="size-3.5" />}
              label={t("أسابيع متتالية بالبحر", "Weeks in a row fishing")}
              value={streak}
              sub={t("رحلة واحدة على الأقل أسبوعياً", "at least one trip a week")}
            />
            <Stat
              icon={<Scale className="size-3.5" />}
              label={t("أثقل سمكة", "Heaviest fish")}
              value={heavy ? <span>{heavy.weight_kg} {t("كغ", "kg")}</span> : "—"}
              sub={heavy ? <>{name(heavy.species_id ? idx.speciesById.get(heavy.species_id) : null)} {heavy.weight_is_estimate ? t("(تقديري)", "(est.)") : ""}</> : undefined}
            />
            <Stat
              icon={<Ruler className="size-3.5" />}
              label={t("أطول سمكة", "Longest fish")}
              value={long ? <span>{long.length_cm} {t("سم", "cm")}</span> : "—"}
              sub={long ? <>{name(long.species_id ? idx.speciesById.get(long.species_id) : null)} {long.length_is_estimate ? t("(تقديري)", "(est.)") : ""}</> : undefined}
            />
            <Stat
              icon={<Sailboat className="size-3.5" />}
              label={t("الطريقة المفضلة", "Favourite technique")}
              value={<span className="text-lg">{favTech ? name(idx.techById.get(favTech.key)) : "—"}</span>}
              sub={favTech ? t(`${favTech.trips} رحلة · نجاح ${pct(favTech.successRate)}`, `${favTech.trips} trips · ${pct(favTech.successRate)} success`) : undefined}
            />
          </div>

          <SectionTitle>{t("هذا الشهر وهذه السنة", "This month & this year")}</SectionTitle>
          <div className="grid grid-cols-2 gap-2">
            {[
              { l: t("هذا الشهر", "This month"), s: mSum },
              { l: t("هذه السنة", "This year"), s: ySum },
            ].map(({ l, s }) => (
              <Card key={l} className="p-3.5">
                <div className="text-xs text-muted">{l}</div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-2xl font-bold">{s.catches}</span>
                  <span className="text-sm text-muted">{t("سمكة", "fish")}</span>
                </div>
                <div className="text-xs text-ink-2">
                  {s.trips} {t("رحلة", "trips")} · {t("نجاح", "success")} {pct(s.successRate)} <N n={s.trips} />
                </div>
              </Card>
            ))}
          </div>

          {(goals.length > 0 || next) && (
            <>
              <SectionTitle action={<Link className="text-sm text-teal" href="/achievements">{t("الكل", "All")}</Link>}>
                {t("الأهداف والإنجازات", "Goals & achievements")}
              </SectionTitle>
              <Card className="space-y-4">
                {goals.map((g) => {
                  const p = goalProgress(g, ds, idx);
                  return (
                    <div key={g.id}>
                      <div className="mb-1 flex justify-between gap-2 text-sm">
                        <span className="truncate">{g.title}</span>
                        <span className="ltr shrink-0 text-muted">
                          {num(p.current)} / {num(p.target)}
                        </span>
                      </div>
                      <Progress value={p.ratio} tone={p.complete ? "good" : "teal"} />
                    </div>
                  );
                })}
                {next && (
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{next.def.icon}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs text-muted">{t("الإنجاز التالي", "Next milestone")}</div>
                      <div className="truncate text-sm font-medium">{t(next.def.name_ar, next.def.name_en)}</div>
                      <Progress value={next.current / next.target} tone="ocean" />
                    </div>
                    <Badge>
                      {next.current}/{next.target}
                    </Badge>
                  </div>
                )}
              </Card>
            </>
          )}

          <SectionTitle action={<Link className="text-sm text-teal" href="/trips">{t("الكل", "All")}</Link>}>{t("آخر النشاطات", "Recent activity")}</SectionTitle>
          <div className="space-y-2">
            {recent.map((tr) => (
              <TripCard key={tr.id} trip={tr} />
            ))}
          </div>

          {rec.heaviest.measured?.photo_media_id && (
            <>
              <SectionTitle>{t("صيدة العمر", "Catch of a lifetime")}</SectionTitle>
              <Link href={`/catch?id=${rec.heaviest.measured.id}`}>
                <Photo mediaId={rec.heaviest.measured.photo_media_id} variant="full" className="aspect-video w-full rounded-[var(--radius-card)]" />
              </Link>
            </>
          )}
        </>
      )}
    </>
  );
}
