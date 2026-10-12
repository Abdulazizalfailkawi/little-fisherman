"use client";

import Link from "next/link";
import { useMemo } from "react";
import { DualDate, Photo } from "./common";
import { KindBadge } from "./EnvPanel";
import { InlineBar } from "./charts";
import { Card, N, Notice, SectionTitle, cn } from "./ui";
import { MOON_EMOJI } from "@/lib/astro";
import { useStore } from "@/lib/db/store";
import { MOON_LABEL, TIDE_LABEL, useI18n } from "@/lib/i18n";
import { catchEnv } from "@/lib/marine/env";
import { compass, fmtWind, readWindUnit } from "@/lib/marine/units";
import { speciesTargetAnalytics, type Breakdown } from "@/lib/speciesAnalytics";
import { MIN_SAMPLE, catchDepth, catchLocation, catchTechnique, pct } from "@/lib/stats";
import type { MoonPhase, Species, Tide } from "@/lib/types";

const TIME_LABEL: Record<string, [string, string]> = {
  night: ["ليل (٠٠–٠٤)", "Night (00–04)"],
  dawn: ["فجر (٠٤–٠٧)", "Dawn (04–07)"],
  morning: ["صباح (٠٧–١١)", "Morning (07–11)"],
  midday: ["ظهر (١١–١٥)", "Midday (11–15)"],
  afternoon: ["عصر (١٥–١٨)", "Afternoon (15–18)"],
  evening: ["مساء (١٨–٢٤)", "Evening (18–24)"],
};

function Table({ title, b, label }: { title: string; b: Breakdown; label: (k: string) => string }) {
  const { t } = useI18n();
  if (!b.groups.length && !b.missing) return null;
  return (
    <div>
      <div className="mb-1 mt-4 flex items-baseline justify-between px-1 text-sm">
        <span className="font-semibold text-ink-2">{title}</span>
        {b.missing > 0 && <span className="text-xs text-muted">{t(`${b.missing} رحلة بدون قيمة`, `${b.missing} trips missing`)}</span>}
      </div>
      <Card className="space-y-2 p-3">
        {b.groups.map((g) => (
          <div key={g.key} className={cn("text-sm", !g.sufficient && "opacity-75")}>
            <div className="flex justify-between gap-2">
              <span>{label(g.key)}</span>
              <span className="text-ink-2">
                {pct(g.rate)} · {g.successful}/{g.trips} {!g.sufficient && <span className="text-[10px] text-warn">{t("عينة صغيرة", "small sample")}</span>}
              </span>
            </div>
            <InlineBar value={g.rate ?? 0} max={1} weak={!g.sufficient} />
          </div>
        ))}
        {!b.groups.length && <p className="text-xs text-muted">{t("لا توجد قيم مسجلة.", "No recorded values.")}</p>}
      </Card>
    </div>
  );
}

export function SpeciesAnalytics({ sp }: { sp: Species }) {
  const { ds, idx } = useStore();
  const { t, lang, name } = useI18n();
  const unit = readWindUnit();
  const a = useMemo(() => speciesTargetAnalytics(ds, idx, sp.id), [ds, idx, sp.id]);
  const catches = useMemo(() => ds.catches.filter((c) => c.species_id === sp.id).sort((x, y) => y.caught_at.localeCompare(x.caught_at)), [ds.catches, sp.id]);

  return (
    <>
      <SectionTitle>{t(`رحلات استهدفت ${sp.name_ar}`, `Trips targeting ${sp.name_en || sp.name_ar}`)}</SectionTitle>
      <Card className="space-y-2 text-sm">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-2xl font-bold">{a.targetTrips}</div>
            <div className="text-xs text-muted">{t("رحلة مستهدفة", "target trips")}</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-good">{a.successful}</div>
            <div className="text-xs text-muted">{t("ناجحة", "successful")}</div>
          </div>
          <div>
            <div className="text-2xl font-bold">{a.unsuccessful}</div>
            <div className="text-xs text-muted">{t("بدون صيده", "without it")}</div>
          </div>
        </div>
        <p className="text-xs leading-relaxed text-muted">
          {t(
            `المقام: الرحلات المنتهية التي اخترت فيها ${sp.name_ar} كنوع مستهدف. الرحلة «ناجحة» إذا صدت فيها ${sp.name_ar} واحدة على الأقل. الرحلات التي استهدفت أنواعاً أخرى لا تُحسب فاشلة. ${a.fishOnOtherTrips} صيدة من هذا النوع جاءت من رحلات غير مستهدفة ولا تدخل في النسب.`,
            `Denominator: completed trips where you set ${sp.name_en || sp.name_ar} as the target. A trip "succeeds" if at least one was caught. Trips targeting other species are not counted as failures. ${a.fishOnOtherTrips} catches of this species came from non-target trips and are not in these rates.`,
          )}
        </p>
        {a.targetTrips > 0 && (
          <div>
            {t("نسبة النجاح", "Success rate")}: <b>{pct(a.rate)}</b> <N n={a.targetTrips} /> · {t("أسماك في الرحلات المستهدفة", "fish on target trips")}: {a.fishOnTargetTrips}
          </div>
        )}
      </Card>
      {a.targetTrips < MIN_SAMPLE && (
        <Notice className="mt-2">
          {t(
            `عدد الرحلات المستهدفة (${a.targetTrips}) قليل لاستنتاج أنماط موثوقة. سجّل المزيد من الرحلات مع تحديد النوع المستهدف.`,
            `Only ${a.targetTrips} target trips — too few for reliable patterns. Keep logging trips with the target species set.`,
          )}
        </Notice>
      )}
      {a.targetTrips > 0 && (
        <>
          <Table title={t("حسب الطريقة", "By technique")} b={a.byTechnique} label={(k) => name(idx.techById.get(k))} />
          <Table title={t("حسب وقت اليوم (بداية الرحلة)", "By time of day (trip start)")} b={a.byTimeOfDay} label={(k) => t(TIME_LABEL[k][0], TIME_LABEL[k][1])} />
          <Table title={t("حسب المد والجزر", "By tide phase")} b={a.byTide} label={(k) => TIDE_LABEL[k as Tide][lang]} />
          <Table title={t("حسب طور القمر", "By moon phase")} b={a.byMoon} label={(k) => `${MOON_EMOJI[k as MoonPhase]} ${MOON_LABEL[k as MoonPhase][lang]}`} />
          <Table title={t("حسب العمق (م)", "By depth (m)")} b={a.byDepth} label={(k) => k} />
          <Table title={t("حسب الموقع", "By spot")} b={a.bySpot} label={(k) => idx.locById.get(k)?.name ?? "?"} />
          <Table title={t("حسب الرياح (عقدة)", "By wind (knots)")} b={a.byWind} label={(k) => k} />
          <Table title={t("حسب ارتفاع الموج (م)", "By wave height (m)")} b={a.byWave} label={(k) => k} />
          <p className="mt-2 px-1 text-xs text-muted">
            {t("هذه ارتباطات في سجلاتك وليست ضماناً — لا يضمن طور قمر أو مد أي صيد.", "These are correlations in your records, not guarantees — no moon or tide phase guarantees a catch.")}
          </p>
        </>
      )}

      {catches.length > 0 && (
        <>
          <SectionTitle>{t("كل الصيدات مع ظروفها", "Every catch with its conditions")}</SectionTitle>
          <div className="space-y-2">
            {catches.map((c) => {
              const e = catchEnv(ds, c);
              const locId = catchLocation(c, idx);
              const techId = catchTechnique(c, idx);
              const d = catchDepth(c, idx);
              return (
                <Link key={c.id} href={`/catch?id=${c.id}`} className="block rounded-[var(--radius-card)] border border-line/70 bg-surface/80 p-3 hover:bg-surface-2">
                  <div className="flex gap-3">
                    <Photo mediaId={c.photo_media_id} className="size-16 shrink-0 rounded-xl" />
                    <div className="min-w-0 flex-1 text-xs">
                      <DualDate iso={c.caught_at} override={c.hijri_date_override ?? undefined} className="block text-sm" />
                      <div className="text-ink-2">
                        {[locId ? idx.locById.get(locId)?.name : null, techId ? name(idx.techById.get(techId)) : null, d ? `${d.depth} m` : null, c.weight_kg != null ? `${c.weight_kg} kg` : null, c.length_cm != null ? `${c.length_cm} cm` : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                        {e.moon && (
                          <span>
                            {MOON_EMOJI[e.moon.value]} {MOON_LABEL[e.moon.value][lang]} {e.moonIllum ? `${e.moonIllum.value}%` : ""}
                          </span>
                        )}
                        {e.tidePhase && (
                          <span className="flex items-center gap-1">
                            🌊 {TIDE_LABEL[e.tidePhase.value][lang]}
                            {e.tideHeight ? ` ${e.tideHeight.value}m` : ""} <KindBadge kind={e.tidePhase.kind} />
                          </span>
                        )}
                        {e.wind && (
                          <span className="flex items-center gap-1">
                            💨 {compass(e.windDir?.value, lang)} {fmtWind(e.wind.value, unit, lang)} <KindBadge kind={e.wind.kind} />
                          </span>
                        )}
                        {e.wave && <span>〰 {e.wave.value} m</span>}
                        {!e.wind && !e.wave && !e.tidePhase && <span className="text-muted">{t("لا توجد بيانات بيئية محفوظة", "No environmental data saved")}</span>}
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
