"use client";

import { useMemo, useState } from "react";
import { Download, Info } from "lucide-react";
import { Bars, InlineBar } from "@/components/charts";
import { FilterBar } from "@/components/Filters";
import { Badge, Button, Card, Empty, N, Notice, PageHeader, SectionTitle, Stat, cn } from "@/components/ui";
import { MOON_EMOJI } from "@/lib/astro";
import { download } from "@/lib/backup";
import { statsCSV } from "@/lib/csv";
import { useStore } from "@/lib/db/store";
import { MOON_LABEL, SEA_LABEL, TIDE_LABEL, useI18n } from "@/lib/i18n";
import {
  MIN_SAMPLE,
  byHour,
  byLocation,
  byMonthKey,
  byMonthOfYear,
  byMoon,
  bySeaState,
  byTechnique,
  byTide,
  byWeekday,
  catchTechnique,
  groupRows,
  depthBySpecies,
  pct,
  speciesCounts,
  summarize,
  tripRows,
  type Filters,
  type GroupStat,
} from "@/lib/stats";
import { fmtMonthName, fmtWeekday, todayKey } from "@/lib/time";
import { MOON_PHASES, type MoonPhase, type SeaState, type Tide } from "@/lib/types";
import { tripEnv } from "@/lib/marine/env";
import { DEPTH_BUCKETS, WAVE_BUCKETS, WIND_BUCKETS_KN, depthBucket, waveBucket, windBucketKn } from "@/lib/speciesAnalytics";

function GroupTable({ groups, labelOf, missing, missingLabel }: { groups: GroupStat[]; labelOf: (k: string) => React.ReactNode; missing?: number; missingLabel?: string }) {
  const { t, num } = useI18n();
  const max = Math.max(0, ...groups.map((g) => g.catchesPerTrip ?? 0));
  const sorted = [...groups].sort((a, b) => b.trips - a.trips);
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full text-sm">
        <thead className="text-xs text-muted">
          <tr className="border-b border-line/50">
            <th className="p-2.5 text-start font-medium">{t("الفئة", "Group")}</th>
            <th className="p-2.5 font-medium">{t("رحلات", "Trips")}</th>
            <th className="p-2.5 font-medium">{t("نجاح الرحلات", "Trip success")}</th>
            <th className="p-2.5 font-medium">{t("سمك/رحلة", "Fish/trip")}</th>
            <th className="p-2.5 font-medium">{t("سمك/ساعة", "Fish/hr")}</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((g) => (
            <tr key={g.key} className={cn("border-b border-line/30", !g.sufficient && "text-ink-2/70")}>
              <td className="p-2.5">
                <div className="font-medium">{labelOf(g.key)}</div>
                {!g.sufficient && <div className="text-[10px] text-warn">{t("عينة صغيرة", "small sample")}</div>}
              </td>
              <td className="p-2.5 text-center">{g.trips}</td>
              <td className="p-2.5 text-center">
                {pct(g.successRate)}
                <div className="text-[10px] text-muted">
                  {g.successful}/{g.trips}
                </div>
              </td>
              <td className="w-28 p-2.5 text-center">
                {num(g.catchesPerTrip, 2)}
                <InlineBar value={g.catchesPerTrip ?? 0} max={max} weak={!g.sufficient} />
              </td>
              <td className="p-2.5 text-center">
                {g.catchesPerHour != null ? num(g.catchesPerHour, 2) : "—"}
                {g.tripsWithHours < g.trips && <div className="text-[10px] text-muted">{t(`${g.tripsWithHours} بتوقيت`, `${g.tripsWithHours} timed`)}</div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {missing ? <p className="px-3 py-2 text-xs text-muted">{missingLabel?.replace("{n}", String(missing))}</p> : null}
    </Card>
  );
}

/** One-line plain answer that respects sample size and avoids causal claims. */
function Compare({ a, b, labelA, labelB }: { a?: GroupStat; b?: GroupStat; labelA: string; labelB: string }) {
  const { t } = useI18n();
  if (!a || !b || a.trips < MIN_SAMPLE || b.trips < MIN_SAMPLE)
    return (
      <Notice>
        {t(
          `لا توجد بيانات كافية للمقارنة بين ${labelA} و${labelB} (يلزم ${MIN_SAMPLE} رحلات على الأقل لكل منهما؛ لديك ${a?.trips ?? 0} و${b?.trips ?? 0}).`,
          `Not enough data to compare ${labelA} and ${labelB} (needs at least ${MIN_SAMPLE} trips each; you have ${a?.trips ?? 0} and ${b?.trips ?? 0}).`,
        )}
      </Notice>
    );
  const better = (a.successRate ?? 0) >= (b.successRate ?? 0) ? [a, labelA, b, labelB] : [b, labelB, a, labelA];
  const [ga, la, gb, lb] = better as [GroupStat, string, GroupStat, string];
  const close = Math.abs((ga.successRate ?? 0) - (gb.successRate ?? 0)) < 0.1;
  return (
    <Notice>
      {close
        ? t(
            `في سجلاتك، نسبة النجاح متقاربة: ${la} ${pct(ga.successRate)} (ع=${ga.trips}) مقابل ${lb} ${pct(gb.successRate)} (ع=${gb.trips}).`,
            `In your records success rates are similar: ${la} ${pct(ga.successRate)} (n=${ga.trips}) vs ${lb} ${pct(gb.successRate)} (n=${gb.trips}).`,
          )
        : t(
            `في سجلاتك، رحلات ${la} نجحت بنسبة ${pct(ga.successRate)} (ع=${ga.trips}) مقابل ${pct(gb.successRate)} لرحلات ${lb} (ع=${gb.trips}). هذا ارتباط في بياناتك وليس دليلاً على السبب.`,
            `In your records, ${la} trips succeeded ${pct(ga.successRate)} of the time (n=${ga.trips}) vs ${pct(gb.successRate)} for ${lb} (n=${gb.trips}). This is a pattern in your data, not proof of cause.`,
          )}
    </Notice>
  );
}

export default function StatsPage() {
  const { ds, idx, hijriOffset } = useStore();
  const { t, lang, name, num } = useI18n();
  const [f, setF] = useState<Filters>({});

  const rows = useMemo(() => tripRows(ds, idx, f, hijriOffset), [ds, idx, f, hijriOffset]);
  const s = summarize(rows);
  const catches = rows.flatMap((r) => r.catches);
  const tech = byTechnique(rows);
  const locs = byLocation(rows);
  const tide = byTide(rows);
  const sea = bySeaState(rows);
  const moon = byMoon(rows);
  const wd = byWeekday(rows).groups;
  const moy = byMonthOfYear(rows).groups;
  const timeline = byMonthKey(rows).groups.sort((a, b) => a.key.localeCompare(b.key));
  const hours = byHour(rows);
  const depth = depthBySpecies(catches, idx);
  const spc = speciesCounts(catches);
  const jig = tech.groups.find((g) => idx.techById.get(g.key)?.code === "jigging");
  const trol = tech.groups.find((g) => idx.techById.get(g.key)?.code === "trolling");
  const calcMoon = rows.filter((r) => r.moon.calculated).length;
  const envByTrip = useMemo(() => new Map(rows.map((r) => [r.trip.id, tripEnv(ds, r.trip)])), [rows, ds]);
  const windG = groupRows(rows, (r) => {
    const w = envByTrip.get(r.trip.id)?.wind;
    return w ? windBucketKn(w.value) : null;
  });
  const waveG = groupRows(rows, (r) => {
    const w = envByTrip.get(r.trip.id)?.wave;
    return w ? waveBucket(w.value) : null;
  });
  const depthG = groupRows(rows, (r) => (r.trip.water_depth_m != null ? depthBucket(r.trip.water_depth_m) : null));
  const order = (keys: readonly string[]) => (a: GroupStat, b: GroupStat) => keys.indexOf(a.key) - keys.indexOf(b.key);

  // Species x technique (what works for each species)
  const spTech = useMemo(() => {
    const m = new Map<string, Map<string, number>>();
    for (const c of catches) {
      if (!c.species_id) continue;
      const tk = catchTechnique(c, idx) ?? "none";
      const inner = m.get(c.species_id) ?? new Map();
      inner.set(tk, (inner.get(tk) ?? 0) + 1);
      m.set(c.species_id, inner);
    }
    return [...m.entries()].map(([sid, inner]) => ({ sid, list: [...inner.entries()].sort((a, b) => b[1] - a[1]), total: [...inner.values()].reduce((a, b) => a + b, 0) })).sort((a, b) => b.total - a.total);
  }, [catches, idx]);

  // Equipment performance
  const gear = useMemo(() => {
    return ds.equipment
      .map((e) => {
        const tripIds = new Set(ds.trip_equipment.filter((x) => x.equipment_id === e.id).map((x) => x.trip_id));
        const catchIds = new Set(ds.catch_equipment.filter((x) => x.equipment_id === e.id).map((x) => x.catch_id));
        const rs = rows.filter((r) => tripIds.has(r.trip.id));
        const sm = summarize(rs);
        const extra = catches.filter((c) => catchIds.has(c.id) && !tripIds.has(c.trip_id)).length;
        return { e, sm, fish: sm.catches + extra };
      })
      .filter((x) => x.sm.trips > 0 || x.fish > 0)
      .sort((a, b) => b.fish - a.fish);
  }, [ds, rows, catches]);

  if (!ds.trips.length)
    return (
      <>
        <PageHeader title={t("الإحصائيات", "Analytics")} />
        <Empty icon="📊" title={t("لا توجد بيانات بعد", "No data yet")}>
          {t("سجّل بعض الرحلات لرؤية التحليلات.", "Log some trips to see analytics.")}
        </Empty>
      </>
    );

  return (
    <>
      <PageHeader
        title={t("الإحصائيات", "Analytics")}
        actions={
          <Button size="sm" variant="secondary" onClick={() => download(`fishing-stats-${todayKey()}.csv`, statsCSV(rows, idx), "text/csv")} aria-label="export csv">
            <Download className="size-4" />
          </Button>
        }
      />
      <FilterBar value={f} onChange={setF} />
      <Notice className="mt-3">
        <Info className="me-1 inline size-4" />
        {t(
          `كل النسب محسوبة من رحلاتك المنتهية بما فيها الرحلات بدون صيد، مع حجم العينة (ع). الفئات بأقل من ${MIN_SAMPLE} رحلات معلّمة كعينة صغيرة. الأنماط هنا ارتباطات في بياناتك وليست أسباباً.`,
          `All rates use your completed trips including blank ones, with sample size (n). Groups with fewer than ${MIN_SAMPLE} trips are marked as small samples. Patterns here are correlations in your data, not causes.`,
        )}
      </Notice>

      {rows.length === 0 ? (
        <div className="mt-6">
          <Empty icon="🔍" title={t("لا توجد رحلات تطابق التصفية", "No trips match these filters")} />
        </div>
      ) : (
        <>
          <SectionTitle>{t("الأداء العام", "Overall")}</SectionTitle>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat label={t("نسبة نجاح الرحلات", "Trip success rate")} value={pct(s.successRate)} sub={t(`${s.successful} من ${s.trips} رحلة`, `${s.successful} of ${s.trips} trips`)} />
            <Stat label={t(f.speciesId ? "عدد هذا النوع" : "عدد الأسماك", f.speciesId ? "Fish of this species" : "Fish caught")} value={s.catches} sub={t(`${s.speciesCount} نوع`, `${s.speciesCount} species`)} />
            <Stat label={t("متوسط السمك لكل رحلة", "Avg fish per trip")} value={num(s.catchesPerTrip, 2)} sub={<N n={s.trips} />} />
            <Stat
              label={t("سمك لكل ساعة صيد", "Fish per fishing hour")}
              value={s.catchesPerHour != null ? num(s.catchesPerHour, 2) : "—"}
              sub={t(`${num(s.hours, 0)} ساعة من ${s.tripsWithHours} رحلة بتوقيت كامل`, `${num(s.hours, 0)} h over ${s.tripsWithHours} timed trips`)}
            />
            <Stat label={t("رحلات بدون صيد", "Blank trips")} value={s.blank} sub={t("محسوبة في كل النسب", "included in every rate")} />
          </div>

          <SectionTitle>{t("الجيقنق أم الترولنق؟", "Jigging or trolling?")}</SectionTitle>
          <Compare a={jig} b={trol} labelA={t("الجيقنق", "jigging")} labelB={t("الترولنق", "trolling")} />

          <SectionTitle>{t("حسب الطريقة", "By technique")}</SectionTitle>
          <GroupTable groups={tech.groups} labelOf={(k) => name(idx.techById.get(k))} missing={tech.missing} missingLabel={t("{n} رحلة بدون طريقة محددة", "{n} trips without a technique")} />

          <SectionTitle>{t("حسب الموقع", "By spot")}</SectionTitle>
          <GroupTable groups={locs.groups} labelOf={(k) => idx.locById.get(k)?.name ?? "?"} missing={locs.missing} missingLabel={t("{n} رحلة بدون موقع", "{n} trips without a spot")} />

          <SectionTitle>{t("أيام الأسبوع — عدد الأسماك", "Day of week — fish caught")}</SectionTitle>
          <Card>
            <Bars
              data={Array.from({ length: 7 }, (_, d) => {
                const g = wd.find((x) => x.key === String(d));
                return {
                  label: fmtWeekday(d, lang, "short"),
                  value: g?.catches ?? 0,
                  weak: (g?.trips ?? 0) < MIN_SAMPLE,
                  detail: g ? t(`${g.trips} رحلة · ${num(g.catchesPerTrip, 2)} لكل رحلة · نجاح ${pct(g.successRate)}`, `${g.trips} trips · ${num(g.catchesPerTrip, 2)}/trip · ${pct(g.successRate)} success`) : t("لا رحلات", "no trips"),
                };
              })}
            />
            <p className="mt-2 text-xs text-muted">{t("الأعمدة الباهتة: أقل من ٥ رحلات. الأيام التي تخرج فيها أكثر ستُظهر أسماكاً أكثر بطبيعة الحال — راجع «لكل رحلة» في التلميح.", "Faded bars: fewer than 5 trips. Days you fish more will naturally show more fish — check “per trip” in the tooltip.")}</p>
          </Card>

          <SectionTitle>{t("الساعات — سمك لكل ساعة صيد", "Hour of day — fish per fishing hour")}</SectionTitle>
          <Card>
            <Bars
              data={hours
                .filter((h) => h.exposureHours > 0 || h.catches > 0)
                .map((h) => ({
                  label: String(h.hour).padStart(2, "0"),
                  value: h.rate,
                  weak: h.exposureHours < 3,
                  detail: t(`${h.catches} سمكة · ${num(h.exposureHours)} ساعة صيد`, `${h.catches} fish · ${num(h.exposureHours)} h fished`),
                }))}
            />
            <p className="mt-2 text-xs text-muted">{t("مُعدّل حسب الوقت الذي قضيته فعلاً في الصيد في كل ساعة (للرحلات ذات وقت بداية ونهاية).", "Normalised by the time you actually spent fishing in each hour (trips with start and end times).")}</p>
          </Card>

          <SectionTitle>{t("الأشهر — سمك لكل رحلة", "Months — fish per trip")}</SectionTitle>
          <Card>
            <Bars
              data={Array.from({ length: 12 }, (_, i) => {
                const g = moy.find((x) => x.key === String(i + 1));
                return {
                  label: fmtMonthName(i + 1, lang, "short"),
                  value: g?.catchesPerTrip ?? null,
                  weak: (g?.trips ?? 0) < MIN_SAMPLE,
                  detail: g ? t(`${g.trips} رحلة · ${g.catches} سمكة`, `${g.trips} trips · ${g.catches} fish`) : t("لا رحلات", "no trips"),
                };
              })}
            />
          </Card>

          {timeline.length > 1 && (
            <>
              <SectionTitle>{t("الخط الزمني — الأسماك شهرياً", "Timeline — fish per month")}</SectionTitle>
              <Card>
                <Bars data={timeline.map((g) => ({ label: g.key.slice(2), value: g.catches, detail: t(`${g.trips} رحلة · نجاح ${pct(g.successRate)}`, `${g.trips} trips · ${pct(g.successRate)} success`) }))} />
              </Card>
            </>
          )}

          <SectionTitle>{t("أطوار القمر", "Moon phases")}</SectionTitle>
          <GroupTable groups={moon.groups.sort((a, b) => MOON_PHASES.indexOf(a.key as MoonPhase) - MOON_PHASES.indexOf(b.key as MoonPhase))} labelOf={(k) => `${MOON_EMOJI[k as MoonPhase]} ${MOON_LABEL[k as MoonPhase][lang]}`} />
          <p className="mt-1 px-1 text-xs text-muted">{t(`${calcMoon} من ${rows.length} رحلة تستخدم الطور المحسوب فلكياً (لم يُدخل يدوياً).`, `${calcMoon} of ${rows.length} trips use the astronomically calculated phase (not entered manually).`)}</p>

          <SectionTitle>{t("المد والجزر (المسجل فقط)", "Tide (recorded only)")}</SectionTitle>
          <GroupTable groups={tide.groups} labelOf={(k) => TIDE_LABEL[k as Tide][lang]} missing={tide.missing} missingLabel={t("{n} رحلة بدون مد/جزر مسجل — مستبعدة، لا نخمّنها", "{n} trips have no recorded tide — excluded, never guessed")} />

          <SectionTitle>{t("حالة البحر (المسجلة فقط)", "Sea state (recorded only)")}</SectionTitle>
          <GroupTable groups={sea.groups} labelOf={(k) => SEA_LABEL[k as SeaState][lang]} missing={sea.missing} missingLabel={t("{n} رحلة بدون حالة بحر مسجلة", "{n} trips without a recorded sea state")} />

          <SectionTitle>{t("الرياح عند بداية الرحلة (عقدة)", "Wind at trip start (knots)")}</SectionTitle>
          <GroupTable groups={[...windG.groups].sort(order(WIND_BUCKETS_KN))} labelOf={(k) => k} missing={windG.missing} missingLabel={t("{n} رحلة بدون بيانات رياح — مستبعدة", "{n} trips without wind data — excluded")} />
          <SectionTitle>{t("ارتفاع الموج عند بداية الرحلة (م)", "Wave height at trip start (m)")}</SectionTitle>
          <GroupTable groups={[...waveG.groups].sort(order(WAVE_BUCKETS))} labelOf={(k) => k} missing={waveG.missing} missingLabel={t("{n} رحلة بدون بيانات موج — مستبعدة", "{n} trips without wave data — excluded")} />
          <SectionTitle>{t("العمق (م)", "Depth (m)")}</SectionTitle>
          <GroupTable groups={[...depthG.groups].sort(order(DEPTH_BUCKETS))} labelOf={(k) => k} missing={depthG.missing} missingLabel={t("{n} رحلة بدون عمق مسجل", "{n} trips without a recorded depth")} />
          <p className="mt-1 px-1 text-xs text-muted">{t("الرياح والموج من لقطات الظروف المحفوظة للرحلة (توقعات/نماذج) أو من إدخالك اليدوي.", "Wind and waves come from each trip's saved condition snapshot (forecast/model) or your manual entry.")}</p>

          <SectionTitle>{t("الأنواع الأكثر صيداً", "Most caught species")}</SectionTitle>
          <Card className="space-y-2">
            {spc.slice(0, 10).map((x) => (
              <div key={x.speciesId ?? "none"} className="text-sm">
                <div className="flex justify-between">
                  <span>{x.speciesId ? name(idx.speciesById.get(x.speciesId)) : t("غير محدد", "Unidentified")}</span>
                  <span className="text-muted">
                    {x.count} · {pct(x.count / catches.length)}
                  </span>
                </div>
                <InlineBar value={x.count} max={spc[0].count} />
              </div>
            ))}
            {!spc.length && <p className="text-sm text-muted">—</p>}
          </Card>

          <SectionTitle>{t("أي طريقة نجحت مع كل نوع؟", "Which technique caught each species?")}</SectionTitle>
          <Card className="space-y-2 text-sm">
            {spTech.slice(0, 10).map((x) => (
              <div key={x.sid} className="flex flex-wrap items-center gap-1.5">
                <span className="me-1 font-medium">{name(idx.speciesById.get(x.sid))}</span>
                {x.list.map(([tk, n]) => (
                  <Badge key={tk} tone="ocean">
                    {tk === "none" ? t("غير محدد", "n/a") : name(idx.techById.get(tk))} ×{n}
                  </Badge>
                ))}
              </div>
            ))}
            <p className="text-xs text-muted">{t("عدد الأسماك فقط — لا يأخذ بالاعتبار كم مرة استخدمت كل طريقة.", "Counts of fish only — doesn't account for how often you used each technique.")}</p>
          </Card>

          <SectionTitle>{t("الأعماق حسب النوع", "Depths by species")}</SectionTitle>
          <Card className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted">
                <tr className="border-b border-line/50">
                  <th className="p-2.5 text-start font-medium">{t("النوع", "Species")}</th>
                  <th className="p-2.5 font-medium">{t("المدى (م)", "Range (m)")}</th>
                  <th className="p-2.5 font-medium">{t("الوسيط", "Median")}</th>
                  <th className="p-2.5 font-medium">n</th>
                </tr>
              </thead>
              <tbody>
                {depth.map((d) => (
                  <tr key={d.speciesId} className="border-b border-line/30">
                    <td className="p-2.5">{name(idx.speciesById.get(d.speciesId))}</td>
                    <td className="ltr p-2.5 text-center">
                      {d.min}–{d.max}
                    </td>
                    <td className="p-2.5 text-center">{num(d.median)}</td>
                    <td className="p-2.5 text-center">
                      {d.n}
                      {d.fromTrip > 0 && <span className="text-[10px] text-muted"> ({d.fromTrip}*)</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-3 py-2 text-xs text-muted">{t("* عمق مأخوذ من الرحلة لأنه لم يُسجّل للسمكة.", "* depth taken from the trip because none was recorded for the catch.")}</p>
          </Card>

          {gear.length > 0 && (
            <>
              <SectionTitle>{t("أداء المعدات", "Gear performance")}</SectionTitle>
              <Card className="overflow-x-auto p-0">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted">
                    <tr className="border-b border-line/50">
                      <th className="p-2.5 text-start font-medium">{t("المعدة", "Gear")}</th>
                      <th className="p-2.5 font-medium">{t("رحلات", "Trips")}</th>
                      <th className="p-2.5 font-medium">{t("نجاح", "Success")}</th>
                      <th className="p-2.5 font-medium">{t("أسماك", "Fish")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gear.map(({ e, sm, fish }) => (
                      <tr key={e.id} className={cn("border-b border-line/30", sm.trips < MIN_SAMPLE && "text-ink-2/70")}>
                        <td className="p-2.5">{e.name}</td>
                        <td className="p-2.5 text-center">{sm.trips}</td>
                        <td className="p-2.5 text-center">{pct(sm.successRate)}</td>
                        <td className="p-2.5 text-center">{fish}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </>
          )}
        </>
      )}
    </>
  );
}
