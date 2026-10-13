"use client";

import { useMemo, useState } from "react";
import { Printer } from "lucide-react";
import { Button, Card, Choice, PageHeader } from "@/components/ui";
import { useStore } from "@/lib/db/store";
import { fmtHijri, tripHijri } from "@/lib/hijri";
import { useI18n } from "@/lib/i18n";
import { byTechnique, pct, records, speciesStats, summarize, tripRows } from "@/lib/stats";
import { fmtDate, kwParts } from "@/lib/time";

export default function ReportPage() {
  const { ds, idx, hijriOffset } = useStore();
  const { t, lang, name, num } = useI18n();
  const years = [...new Set(ds.trips.map((x) => kwParts(x.started_at).year))].sort((a, b) => b - a);
  const [year, setYear] = useState<string>("all");

  const f = year === "all" ? {} : { from: `${year}-01-01`, to: `${year}-12-31` };
  const rows = useMemo(() => tripRows(ds, idx, f, hijriOffset), [ds, idx, year, hijriOffset]); // eslint-disable-line react-hooks/exhaustive-deps
  const catches = rows.flatMap((r) => r.catches);
  const s = summarize(rows);
  const rec = records(rows, catches);
  const species = ds.species
    .map((sp) => {
      const st = speciesStats(sp, { ...ds, catches }, idx);
      return st;
    })
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count);
  const tech = byTechnique(rows).groups.sort((a, b) => b.trips - a.trips);

  const cell = "border-b border-line/40 p-2 print:border-slate-300";
  return (
    <>
      <PageHeader
        title={t("تقرير الصيد", "Fishing report")}
        back="/stats"
        actions={
          <Button size="sm" onClick={() => window.print()}>
            <Printer className="size-4" /> {t("طباعة / PDF", "Print / PDF")}
          </Button>
        }
      />
      <div className="no-print mb-4">
        <Choice value={year} allowClear={false} onChange={(v) => v && setYear(v)} options={[{ value: "all", label: t("كل السجلات", "All time") }, ...years.map((y) => ({ value: String(y), label: String(y) }))]} />
      </div>

      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold">🎣 {t("تقرير الصيد الشخصي", "Personal fishing report")}</h1>
          <p className="print-muted text-sm text-muted">
            {year === "all" ? t("كل السجلات", "All records") : year} · {t("أُعد في", "Generated")} {fmtDate(new Date(), lang)}
          </p>
        </div>

        <Card className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            [t("الرحلات", "Trips"), s.trips],
            [t("الأسماك", "Fish"), s.catches],
            [t("نسبة النجاح", "Success rate"), `${pct(s.successRate)} (${s.successful}/${s.trips})`],
            [t("الأنواع", "Species"), s.speciesCount],
            [t("ساعات الصيد", "Hours"), num(s.hours, 0)],
            [t("سمك/رحلة", "Fish/trip"), num(s.catchesPerTrip, 2)],
            [t("سمك/ساعة", "Fish/hour"), s.catchesPerHour != null ? num(s.catchesPerHour, 2) : "—"],
            [t("بدون صيد", "Blank trips"), s.blank],
          ].map(([k, v]) => (
            <div key={String(k)}>
              <div className="print-muted text-xs text-muted">{k}</div>
              <div className="text-lg font-bold">{v}</div>
            </div>
          ))}
        </Card>

        <Card>
          <h2 className="mb-2 font-semibold">{t("الأرقام القياسية", "Records")}</h2>
          <ul className="space-y-1 text-sm">
            {rec.heaviest.measured && (
              <li>
                ⚖️ {t("الأثقل", "Heaviest")}: {rec.heaviest.measured.weight_kg} {t("كغ", "kg")} — {name(idx.speciesById.get(rec.heaviest.measured.species_id ?? ""))} ({fmtDate(rec.heaviest.measured.caught_at, lang)}) · {t("مقاس", "measured")}
              </li>
            )}
            {rec.longest.measured && (
              <li>
                📏 {t("الأطول", "Longest")}: {rec.longest.measured.length_cm} {t("سم", "cm")} — {name(idx.speciesById.get(rec.longest.measured.species_id ?? ""))} ({fmtDate(rec.longest.measured.caught_at, lang)}) · {t("مقاس", "measured")}
              </li>
            )}
            {rec.mostFishTrip && (
              <li>
                🎣 {t("أكثر أسماك في رحلة", "Most fish in a trip")}: {rec.mostFishTrip.count} ({fmtDate(rec.mostFishTrip.row.trip.started_at, lang)})
              </li>
            )}
            {rec.bestMonth && (
              <li>
                📅 {t("أنجح شهر", "Best month")}: {rec.bestMonth.month} — {rec.bestMonth.catches} {t("سمكة", "fish")}
              </li>
            )}
          </ul>
        </Card>

        <Card className="overflow-x-auto p-0">
          <h2 className="p-3 pb-1 font-semibold">{t("الأنواع", "Species")}</h2>
          <table className="w-full text-sm">
            <thead className="print-muted text-xs text-muted">
              <tr>
                <th className={`${cell} text-start`}>{t("النوع", "Species")}</th>
                <th className={cell}>{t("العدد", "Count")}</th>
                <th className={cell}>{t("الأثقل", "Heaviest")}</th>
                <th className={cell}>{t("أول مرة", "First")}</th>
              </tr>
            </thead>
            <tbody>
              {species.map((x) => (
                <tr key={x.species.id}>
                  <td className={cell}>
                    {name(x.species)} <span className="print-muted text-xs text-muted">{t(x.species.name_en ?? "", x.species.name_ar)}</span>
                  </td>
                  <td className={`${cell} text-center`}>{x.count}</td>
                  <td className={`${cell} text-center`}>{x.heaviest?.weight_kg != null ? `${x.heaviest.weight_kg}${x.heaviest.weight_is_estimate ? "≈" : ""}` : "—"}</td>
                  <td className={`${cell} text-center`}>{x.first ? fmtDate(x.first.caught_at, lang) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card className="overflow-x-auto p-0">
          <h2 className="p-3 pb-1 font-semibold">{t("الطرق", "Techniques")}</h2>
          <table className="w-full text-sm">
            <thead className="print-muted text-xs text-muted">
              <tr>
                <th className={`${cell} text-start`}>{t("الطريقة", "Technique")}</th>
                <th className={cell}>{t("رحلات", "Trips")}</th>
                <th className={cell}>{t("نجاح", "Success")}</th>
                <th className={cell}>{t("سمك/رحلة", "Fish/trip")}</th>
              </tr>
            </thead>
            <tbody>
              {tech.map((g) => (
                <tr key={g.key}>
                  <td className={cell}>{name(idx.techById.get(g.key))}</td>
                  <td className={`${cell} text-center`}>{g.trips}</td>
                  <td className={`${cell} text-center`}>{pct(g.successRate)}</td>
                  <td className={`${cell} text-center`}>{num(g.catchesPerTrip, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card className="overflow-x-auto p-0">
          <h2 className="p-3 pb-1 font-semibold">{t("سجل الرحلات", "Trip log")}</h2>
          <table className="w-full text-sm">
            <thead className="print-muted text-xs text-muted">
              <tr>
                <th className={`${cell} text-start`}>{t("التاريخ", "Date")}</th>
                <th className={`${cell} text-start`}>{t("الموقع", "Spot")}</th>
                <th className={cell}>{t("الطريقة", "Technique")}</th>
                <th className={cell}>{t("أسماك", "Fish")}</th>
              </tr>
            </thead>
            <tbody>
              {[...rows].reverse().map((r) => (
                <tr key={r.trip.id}>
                  <td className={cell}>
                    {fmtDate(r.trip.started_at, lang)}
                    <div className="print-muted text-[10px] text-muted">{fmtHijri(tripHijri(r.trip, hijriOffset).date, lang)}</div>
                  </td>
                  <td className={cell}>{r.trip.location_id ? idx.locById.get(r.trip.location_id)?.name : "—"}</td>
                  <td className={`${cell} text-center`}>{r.trip.technique_id ? name(idx.techById.get(r.trip.technique_id)) : "—"}</td>
                  <td className={`${cell} text-center`}>{r.catches.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  );
}
