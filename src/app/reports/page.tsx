"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Printer } from "lucide-react";
import { Badge, Button, Card, Choice, Input, N, Notice, PageHeader, SectionTitle } from "@/components/ui";
import { MOON_EMOJI } from "@/lib/astro";
import { useStore } from "@/lib/db/store";
import { MOON_LABEL, TIDE_LABEL, useI18n } from "@/lib/i18n";
import { buildReport, periodRange, type Period } from "@/lib/reports";
import { pct } from "@/lib/stats";
import { addDays, dateKeyToDate, fmtDate, todayKey } from "@/lib/time";
import type { MoonPhase, Tide } from "@/lib/types";

export default function ReportsPage() {
  const { ds, idx, hijriOffset } = useStore();
  const { t, lang, name, num } = useI18n();
  const [period, setPeriod] = useState<Period>("month");
  const [anchor, setAnchor] = useState(todayKey());
  const [custom, setCustom] = useState({ from: addDays(todayKey(), -30), to: todayKey() });
  const range = periodRange(period, anchor, custom);

  const names = (kind: "species" | "tech" | "loc", id: string | null, l: "ar" | "en") => {
    if (!id) return l === "ar" ? "غير محدد" : "unspecified";
    if (kind === "species") {
      const s = idx.speciesById.get(id);
      return s ? (l === "ar" ? s.name_ar : s.name_en || s.name_ar) : "?";
    }
    if (kind === "tech") {
      const x = idx.techById.get(id);
      return x ? (l === "ar" ? x.name_ar : x.name_en) : "?";
    }
    const loc = idx.locById.get(id);
    return loc ? (l === "ar" ? loc.name : loc.name_en || loc.name) : "?";
  };
  const r = useMemo(() => buildReport(ds, idx, range, hijriOffset, names), [ds, idx, range.from, range.to, hijriOffset]); // eslint-disable-line react-hooks/exhaustive-deps

  const shift = (dir: number) => {
    if (period === "week") setAnchor(addDays(anchor, dir * 7));
    else if (period === "month") {
      const d = dateKeyToDate(anchor);
      d.setUTCMonth(d.getUTCMonth() + dir, 15);
      setAnchor(d.toISOString().slice(0, 10));
    } else if (period === "year") setAnchor(`${Number(anchor.slice(0, 4)) + dir}${anchor.slice(4)}`);
  };
  const { dir } = useI18n();
  const Prev = dir === "rtl" ? ChevronRight : ChevronLeft;
  const Next = dir === "rtl" ? ChevronLeft : ChevronRight;

  return (
    <>
      <PageHeader
        title={t("تقارير الصيد", "Fishing reports")}
        back="/more"
        actions={
          <Button size="sm" variant="secondary" onClick={() => window.print()} aria-label="print">
            <Printer className="size-4" />
          </Button>
        }
      />
      <div className="no-print space-y-3">
        <Choice
          value={period}
          allowClear={false}
          onChange={(v) => v && setPeriod(v)}
          options={[
            { value: "week", label: t("أسبوعي", "Weekly") },
            { value: "month", label: t("شهري", "Monthly") },
            { value: "year", label: t("سنوي", "Yearly") },
            { value: "custom", label: t("مخصص", "Custom") },
          ]}
        />
        {period === "custom" ? (
          <div className="grid grid-cols-2 gap-2">
            <Input type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} />
            <Input type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} />
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <Button size="sm" variant="ghost" onClick={() => shift(-1)} aria-label="previous">
              <Prev className="size-5" />
            </Button>
            <span className="text-sm font-semibold">
              {fmtDate(range.from + "T09:00:00Z", lang)} – {fmtDate(range.to + "T09:00:00Z", lang)}
            </span>
            <Button size="sm" variant="ghost" onClick={() => shift(1)} aria-label="next">
              <Next className="size-5" />
            </Button>
          </div>
        )}
      </div>

      {r.excludedDemo > 0 && (
        <Notice className="mt-3">{t(`تم استبعاد ${r.excludedDemo} رحلة تجريبية من هذا التقرير.`, `${r.excludedDemo} demo trips were excluded from this report.`)}</Notice>
      )}

      <Card className="mt-3 space-y-2">
        {r.sentences.map((s, i) => (
          <p key={i} className="leading-relaxed">
            {t(s.ar, s.en)}
          </p>
        ))}
      </Card>

      {r.summary.trips > 0 && (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              [t("الرحلات", "Trips"), r.summary.trips],
              [t("الأسماك", "Fish"), r.summary.catches],
              [t("ناجحة / بدون صيد", "Successful / blank"), `${r.summary.successful} / ${r.summary.blank}`],
              [t("سمك لكل رحلة", "Fish per trip"), num(r.summary.catchesPerTrip, 2)],
            ].map(([k, v]) => (
              <Card key={String(k)} className="p-3">
                <div className="text-xs text-muted">{k}</div>
                <div className="text-xl font-bold">{v}</div>
              </Card>
            ))}
          </div>

          <SectionTitle>{t("الأنواع", "Species")}</SectionTitle>
          <Card className="space-y-1 text-sm">
            {r.species.map((s) => (
              <div key={s.speciesId ?? "x"} className="flex justify-between">
                <span>{names("species", s.speciesId, lang)}</span>
                <span className="text-muted">{s.count}</span>
              </div>
            ))}
            {!r.species.length && <p className="text-muted">—</p>}
          </Card>

          <SectionTitle>{t("الطرق", "Techniques")}</SectionTitle>
          <Card className="space-y-1 text-sm">
            {r.techniques.map((g) => (
              <div key={g.key} className="flex justify-between gap-2">
                <span>{names("tech", g.key, lang)}</span>
                <span className="text-muted">
                  {g.catches} {t("سمكة", "fish")} · {pct(g.successRate)} <N n={g.trips} />
                </span>
              </div>
            ))}
          </Card>

          <SectionTitle>{t("المواقع", "Spots")}</SectionTitle>
          <Card className="space-y-1 text-sm">
            {r.spots.map((g) => (
              <div key={g.key} className="flex justify-between gap-2">
                <span>{names("loc", g.key, lang)}</span>
                <span className="text-muted">
                  {g.catches} {t("سمكة", "fish")} · {pct(g.successRate)} <N n={g.trips} />
                </span>
              </div>
            ))}
            {!r.spots.length && <p className="text-muted">—</p>}
          </Card>

          <SectionTitle>{t("أنماط الظروف المتوفرة", "Available condition patterns")}</SectionTitle>
          <Card className="space-y-3 text-sm">
            <div>
              <div className="mb-1 text-xs text-muted">{t("المد والجزر (رحلات ناجحة / الكل)", "Tide (successful / all trips)")}</div>
              <div className="flex flex-wrap gap-1.5">
                {r.tide.map((x) => (
                  <Badge key={x.key}>
                    {TIDE_LABEL[x.key as Tide][lang]} {x.successful}/{x.trips}
                  </Badge>
                ))}
                {r.tideMissing > 0 && <Badge tone="warn">{t(`${r.tideMissing} بدون بيانات`, `${r.tideMissing} missing`)}</Badge>}
              </div>
            </div>
            <div>
              <div className="mb-1 text-xs text-muted">{t("طور القمر (محسوب) — ناجحة / الكل", "Moon phase (calculated) — successful / all")}</div>
              <div className="flex flex-wrap gap-1.5">
                {r.moon.map((x) => (
                  <Badge key={x.key}>
                    {MOON_EMOJI[x.key as MoonPhase]} {MOON_LABEL[x.key as MoonPhase][lang]} {x.successful}/{x.trips}
                  </Badge>
                ))}
              </div>
            </div>
            <p className="text-xs text-muted">{t("أعداد صغيرة — للاطلاع فقط، وليست أسباباً.", "Small numbers — for reference only, not causes.")}</p>
          </Card>

          {(r.records.heaviest.measured || r.records.mostFishTrip) && (
            <>
              <SectionTitle>{t("أرقام الفترة", "Period records")}</SectionTitle>
              <Card className="space-y-1 text-sm">
                {r.records.heaviest.measured && (
                  <div>
                    ⚖️ {r.records.heaviest.measured.weight_kg} {t("كغ", "kg")} — {names("species", r.records.heaviest.measured.species_id, lang)} ({fmtDate(r.records.heaviest.measured.caught_at, lang)})
                  </div>
                )}
                {r.records.longest.measured && (
                  <div>
                    📏 {r.records.longest.measured.length_cm} {t("سم", "cm")} — {names("species", r.records.longest.measured.species_id, lang)}
                  </div>
                )}
                {r.records.mostFishTrip && (
                  <div>
                    🎣 {t("أكثر أسماك في رحلة", "Most fish in a trip")}: {r.records.mostFishTrip.count} ({fmtDate(r.records.mostFishTrip.row.trip.started_at, lang)})
                  </div>
                )}
              </Card>
            </>
          )}
        </>
      )}
    </>
  );
}
