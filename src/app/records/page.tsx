"use client";

import Link from "next/link";
import { useMemo } from "react";
import { DualDate, MeasureTag, Photo } from "@/components/common";
import { Badge, Card, Empty, N, PageHeader, SectionTitle } from "@/components/ui";
import { useStore } from "@/lib/db/store";
import { useI18n } from "@/lib/i18n";
import { pct, records, tripRows } from "@/lib/stats";
import { fmtDate } from "@/lib/time";
import type { Catch } from "@/lib/types";

function RecordCard({ icon, title, children, href, mediaId }: { icon: string; title: string; children: React.ReactNode; href?: string; mediaId?: string | null }) {
  const body = (
    <Card className="flex items-center gap-3">
      {mediaId !== undefined ? (
        <Photo mediaId={mediaId} className="size-16 shrink-0 rounded-xl" fallback={<span className="text-2xl">{icon}</span>} />
      ) : (
        <div className="grid size-16 shrink-0 place-items-center rounded-xl bg-surface-2 text-2xl">{icon}</div>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-xs text-muted">{title}</div>
        {children}
      </div>
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export default function RecordsPage() {
  const { ds, idx } = useStore();
  const { t, lang, name, num } = useI18n();
  const rows = useMemo(() => tripRows(ds, idx), [ds, idx]);
  const r = useMemo(() => records(rows, ds.catches), [rows, ds.catches]);

  if (!ds.catches.length && !rows.length)
    return (
      <>
        <PageHeader title={t("الأرقام القياسية", "Personal records")} back="/more" />
        <Empty icon="🏆" title={t("لا توجد أرقام بعد", "No records yet")} />
      </>
    );

  const fishRecord = (c: Catch | null, kind: "w" | "l") =>
    c && (
      <>
        <div className="text-xl font-bold">{kind === "w" ? `${c.weight_kg} ${t("كغ", "kg")}` : `${c.length_cm} ${t("سم", "cm")}`}</div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-2">
          {name(c.species_id ? idx.speciesById.get(c.species_id) : null)} · {fmtDate(c.caught_at, lang)}
          <MeasureTag estimate={kind === "w" ? c.weight_is_estimate : c.length_is_estimate} />
        </div>
      </>
    );

  return (
    <>
      <PageHeader title={t("الأرقام القياسية", "Personal records")} back="/more" />

      <SectionTitle>{t("الأسماك", "Fish")}</SectionTitle>
      <div className="space-y-2">
        <RecordCard icon="⚖️" title={t("أثقل سمكة (قياس فعلي)", "Heaviest fish (measured)")} href={r.heaviest.measured ? `/catch?id=${r.heaviest.measured.id}` : undefined} mediaId={r.heaviest.measured?.photo_media_id ?? null}>
          {fishRecord(r.heaviest.measured, "w") ?? <div className="text-sm text-muted">{t("لا يوجد وزن مقاس بعد", "No measured weight yet")}</div>}
        </RecordCard>
        {r.heaviest.estimated && (!r.heaviest.measured || r.heaviest.estimated.weight_kg! > r.heaviest.measured.weight_kg!) && (
          <RecordCard icon="≈" title={t("أثقل وزن تقديري (غير مُعتمد كرقم قياسي)", "Heaviest estimated weight (not counted as a record)")} href={`/catch?id=${r.heaviest.estimated.id}`} mediaId={r.heaviest.estimated.photo_media_id}>
            {fishRecord(r.heaviest.estimated, "w")}
          </RecordCard>
        )}
        <RecordCard icon="📏" title={t("أطول سمكة (قياس فعلي)", "Longest fish (measured)")} href={r.longest.measured ? `/catch?id=${r.longest.measured.id}` : undefined} mediaId={r.longest.measured?.photo_media_id ?? null}>
          {fishRecord(r.longest.measured, "l") ?? <div className="text-sm text-muted">{t("لا يوجد طول مقاس بعد", "No measured length yet")}</div>}
        </RecordCard>
        {r.longest.estimated && (!r.longest.measured || r.longest.estimated.length_cm! > r.longest.measured.length_cm!) && (
          <RecordCard icon="≈" title={t("أطول طول تقديري (غير مُعتمد)", "Longest estimated length (not counted)")} href={`/catch?id=${r.longest.estimated.id}`} mediaId={r.longest.estimated.photo_media_id}>
            {fishRecord(r.longest.estimated, "l")}
          </RecordCard>
        )}
        {r.topSpecies && (
          <RecordCard icon="🐟" title={t("النوع الأكثر صيداً", "Most frequently caught species")} href={`/species?id=${r.topSpecies.speciesId}`}>
            <div className="text-lg font-bold">{name(idx.speciesById.get(r.topSpecies.speciesId))}</div>
            <div className="text-xs text-ink-2">×{r.topSpecies.count}</div>
          </RecordCard>
        )}
      </div>

      <SectionTitle>{t("الرحلات", "Trips")}</SectionTitle>
      <div className="space-y-2">
        {r.mostFishTrip && (
          <RecordCard icon="🎣" title={t("أكثر أسماك في رحلة واحدة", "Most fish in one trip")} href={`/trip?id=${r.mostFishTrip.row.trip.id}`}>
            <div className="text-xl font-bold">{r.mostFishTrip.count}</div>
            <DualDate iso={r.mostFishTrip.row.trip.started_at} override={r.mostFishTrip.row.trip.hijri_date_override} className="text-xs text-ink-2" />
          </RecordCard>
        )}
        {r.mostSpeciesTrip && (
          <RecordCard icon="🌈" title={t("أكثر أنواع في رحلة واحدة", "Most species in one trip")} href={`/trip?id=${r.mostSpeciesTrip.row.trip.id}`}>
            <div className="text-xl font-bold">{r.mostSpeciesTrip.count}</div>
            <DualDate iso={r.mostSpeciesTrip.row.trip.started_at} override={r.mostSpeciesTrip.row.trip.hijri_date_override} className="text-xs text-ink-2" />
          </RecordCard>
        )}
        {r.bestMonth && (
          <RecordCard icon="📅" title={t("أنجح شهر (بعدد الأسماك)", "Most successful month (by fish)")}>
            <div className="text-lg font-bold">{fmtDate(`${r.bestMonth.month}-15T12:00:00Z`, lang, { day: undefined, month: "long", year: "numeric" })}</div>
            <div className="text-xs text-ink-2">
              {t(`${r.bestMonth.catches} سمكة · ${r.bestMonth.successful}/${r.bestMonth.trips} رحلات ناجحة`, `${r.bestMonth.catches} fish · ${r.bestMonth.successful}/${r.bestMonth.trips} trips successful`)}
            </div>
          </RecordCard>
        )}
        {r.bestSpot && (
          <RecordCard icon="📍" title={r.bestSpot.basis === "rate" ? t("أفضل موقع (سمك/رحلة، ٣ رحلات+)", "Best spot (fish/trip, 3+ trips)") : t("أفضل موقع (إجمالي — عينات صغيرة)", "Best spot (total — small samples)")}>
            <div className="text-lg font-bold">{idx.locById.get(r.bestSpot.locationId)?.name}</div>
            <div className="text-xs text-ink-2">
              {num(r.bestSpot.stat.catchesPerTrip, 2)} {t("سمكة/رحلة", "fish/trip")} · {pct(r.bestSpot.stat.successRate)} <N n={r.bestSpot.stat.trips} />
            </div>
          </RecordCard>
        )}
        {r.bestTechnique && (
          <RecordCard icon="⚓" title={r.bestTechnique.basis === "rate" ? t("أفضل طريقة (نسبة النجاح، ٣ رحلات+)", "Best technique (success rate, 3+ trips)") : t("أفضل طريقة (إجمالي — عينات صغيرة)", "Best technique (total — small samples)")}>
            <div className="text-lg font-bold">{name(idx.techById.get(r.bestTechnique.techniqueId))}</div>
            <div className="text-xs text-ink-2">
              {pct(r.bestTechnique.stat.successRate)} {t("نجاح", "success")} · {num(r.bestTechnique.stat.catchesPerTrip, 2)} {t("سمكة/رحلة", "fish/trip")} <N n={r.bestTechnique.stat.trips} />
            </div>
          </RecordCard>
        )}
        {r.longestSuccessStreak && (
          <RecordCard icon="🔥" title={t("أطول سلسلة رحلات ناجحة متتالية", "Longest run of successful trips")}>
            <div className="text-xl font-bold">{r.longestSuccessStreak.length}</div>
            <div className="text-xs text-ink-2">
              {fmtDate(r.longestSuccessStreak.from.started_at, lang)} → {fmtDate(r.longestSuccessStreak.to.started_at, lang)}
            </div>
          </RecordCard>
        )}
      </div>
      <p className="mt-4 px-1 text-xs text-muted">
        <Badge tone="good">{t("مقاس", "Measured")}</Badge> {t("= أدخلته كقياس فعلي.", "= you entered it as a real measurement.")}{" "}
        <Badge tone="warn">{t("تقديري", "Estimated")}</Badge> {t("= تقدير، لا يُحتسب كرقم قياسي.", "= an estimate; not counted as a record.")}
      </p>
    </>
  );
}
