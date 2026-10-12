"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Info } from "lucide-react";
import { CatchRow, TripCard } from "@/components/common";
import { FilterBar } from "@/components/Filters";
import { Badge, Button, Card, Choice, N, Notice, PageHeader, SectionTitle, cn } from "@/components/ui";
import { CYCLE_LABEL, DEFAULT_CYCLE, cycleInfo, cycleOnDate, readCycleConfig, type CycleConfig } from "@/lib/tidecycle";
import { useStore } from "@/lib/db/store";
import { addHijriMonths, fmtHijri, hijriCalendarName, hijriForDateKey, hijriMonthDays, hijriMonthName, parseHijri } from "@/lib/hijri";
import { useI18n } from "@/lib/i18n";
import { pct, summarize, tripRows, type Filters, type TripRow } from "@/lib/stats";
import { dateKeyToDate, fmtDate, fmtMonthName, fmtWeekday, kwParts, todayKey } from "@/lib/time";

type View = "greg" | "hijri";

function gregMonthDays(y: number, m: number): string[] {
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: n }, (_, i) => `${y}-${String(m).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`);
}

export default function CalendarPage() {
  const { ds, idx, hijriOffset } = useStore();
  const { t, lang, dir } = useI18n();
  const today = todayKey();
  const [view, setView] = useState<View>("greg");
  const tp = kwParts(new Date());
  const th = hijriForDateKey(today, hijriOffset);
  const [g, setG] = useState({ year: tp.year, month: tp.month });
  const [h, setH] = useState({ year: th.year, month: th.month });
  const [selected, setSelected] = useState<string | null>(today);
  const [f, setF] = useState<Filters>({});
  const [cycleCfg, setCycleCfg] = useState<CycleConfig>(DEFAULT_CYCLE);
  const [showCycle, setShowCycle] = useState(true);
  useEffect(() => {
    setCycleCfg(readCycleConfig());
    try {
      setShowCycle(localStorage.getItem("ft.showCycle") !== "0");
    } catch {}
  }, []);
  const toggleCycle = () => {
    setShowCycle((v) => {
      try {
        localStorage.setItem("ft.showCycle", v ? "0" : "1");
      } catch {}
      return !v;
    });
  };

  const rows = useMemo(() => tripRows(ds, idx, { techniqueId: f.techniqueId, speciesId: f.speciesId, locationId: f.locationId }, hijriOffset, true), [ds, idx, f, hijriOffset]);
  const days = view === "greg" ? gregMonthDays(g.year, g.month) : hijriMonthDays(h.year, h.month, hijriOffset);
  const byDay = useMemo(() => {
    const m = new Map<string, TripRow[]>();
    for (const r of rows) {
      // A species filter keeps trips that caught or targeted it
      if (f.speciesId && !r.success && r.trip.target_species_id !== f.speciesId) continue;
      let day = r.day;
      // In the Hijri view, a manually corrected Hijri date decides where the trip appears.
      const o = view === "hijri" ? parseHijri(r.trip.hijri_date_override) : null;
      if (o && o.year === h.year && o.month === h.month) {
        const hit = days.find((d) => hijriForDateKey(d, hijriOffset).day === o.day);
        if (hit) day = hit;
      }
      m.set(day, [...(m.get(day) ?? []), r]);
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, f.speciesId, view, h.year, h.month, hijriOffset, days.join()]);

  const lead = days.length ? dateKeyToDate(days[0]).getUTCDay() : 0;
  const monthRows = days.flatMap((d) => byDay.get(d) ?? []).filter((r) => r.trip.status === "completed");
  const ms = summarize(monthRows);
  const cycleOf = (key: string) => cycleOnDate(key, hijriOffset, cycleCfg);
  const monthByCycle = (["hamal", "fasad"] as const).map((c) => {
    const rs = monthRows.filter((r) => cycleOf(r.day) === c);
    return { c, trips: rs.length, successful: rs.filter((r) => r.success).length, fish: rs.reduce((a, r) => a + r.catches.length, 0) };
  });

  const step = (n: number) => {
    if (view === "greg") {
      const i = g.year * 12 + g.month - 1 + n;
      setG({ year: Math.floor(i / 12), month: (i % 12) + 1 });
    } else setH(addHijriMonths(h.year, h.month, n));
  };

  const title =
    view === "greg"
      ? `${fmtMonthName(g.month, lang)} ${g.year}`
      : `${hijriMonthName(h.month, lang)} ${h.year} ${lang === "ar" ? "هـ" : "AH"}`;
  const secondary =
    days.length > 0
      ? view === "greg"
        ? (() => {
            const a = hijriForDateKey(days[0], hijriOffset);
            const b = hijriForDateKey(days[days.length - 1], hijriOffset);
            return `${hijriMonthName(a.month, lang)}${a.month !== b.month ? " – " + hijriMonthName(b.month, lang) : ""} ${b.year}`;
          })()
        : `${fmtDate(days[0], lang, { year: undefined })} – ${fmtDate(days[days.length - 1], lang)}`
      : "";

  // Yearly summary (by month of the displayed calendar's year)
  const yearSummary = useMemo(() => {
    const out: { label: string; rows: TripRow[] }[] = [];
    for (let m = 1; m <= 12; m++) {
      const ds2 = view === "greg" ? gregMonthDays(g.year, m) : hijriMonthDays(h.year, m, hijriOffset);
      const set = new Set(ds2);
      out.push({
        label: view === "greg" ? fmtMonthName(m, lang, "short") : hijriMonthName(m, lang),
        rows: rows.filter((r) => set.has(r.day) && r.trip.status === "completed"),
      });
    }
    return out;
  }, [view, g.year, h.year, rows, lang, hijriOffset]);
  const yearTotal = summarize(yearSummary.flatMap((y) => y.rows));

  const PrevIcon = dir === "rtl" ? ChevronRight : ChevronLeft;
  const NextIcon = dir === "rtl" ? ChevronLeft : ChevronRight;
  const sel = selected ? byDay.get(selected) ?? [] : [];

  return (
    <>
      <PageHeader title={t("تقويم الصيد", "Fishing calendar")} />
      <div className="space-y-3">
        <Choice
          value={view}
          allowClear={false}
          onChange={(v) => v && setView(v)}
          options={[
            { value: "greg", label: t("ميلادي", "Gregorian") },
            { value: "hijri", label: t("هجري", "Hijri") },
          ]}
        />
        <FilterBar value={f} onChange={setF} fields={["technique", "species", "location"]} />
      </div>

      <Card className="mt-3 p-3">
        <div className="mb-3 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => step(-1)} aria-label="previous">
            <PrevIcon className="size-5" />
          </Button>
          <div className="text-center">
            <div className="font-bold">{title}</div>
            <div className="text-xs text-muted">{secondary}</div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => step(1)} aria-label="next">
            <NextIcon className="size-5" />
          </Button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted">
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i}>{fmtWeekday(i, lang, "short")}</div>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {Array.from({ length: lead }, (_, i) => (
            <div key={"l" + i} />
          ))}
          {days.map((d) => {
            const trips = byDay.get(d) ?? [];
            const fish = trips.reduce((s, r) => s + r.catches.length, 0);
            const success = trips.some((r) => r.success);
            const primary = view === "greg" ? Number(d.slice(8)) : hijriForDateKey(d, hijriOffset).day;
            const second = view === "greg" ? hijriForDateKey(d, hijriOffset).day : Number(d.slice(8));
            const cyc = showCycle ? cycleOf(d) : "between";
            return (
              <button
                key={d}
                onClick={() => setSelected(d)}
                className={cn(
                  "relative flex aspect-square flex-col items-center justify-center rounded-xl text-sm transition-colors",
                  trips.length ? (success ? "bg-good/15" : "bg-surface-3") : "hover:bg-surface-2",
                  selected === d && "ring-2 ring-teal",
                  d === today && "font-bold text-teal",
                )}
              >
                <span>{primary}</span>
                <span className="text-[9px] text-muted">{second}</span>
                {cyc !== "between" && (
                  <span
                    aria-label={CYCLE_LABEL[cyc][lang]}
                    className={cn("absolute inset-x-2 bottom-0.5 h-1 rounded-full", cyc === "hamal" ? "bg-ocean" : "bg-warn/80")}
                  />
                )}
                {trips.length > 0 && (
                  <span
                    className={cn(
                      "absolute -top-1 end-0 min-w-4 rounded-full px-1 text-[10px] font-bold leading-4",
                      success ? "bg-good text-abyss" : "bg-muted/60 text-abyss",
                    )}
                  >
                    {success ? fish : "0"}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted">
          <span className="flex items-center gap-1">
            <span className="size-3 rounded bg-good/60" /> {t("رحلة ناجحة (عدد الأسماك)", "Successful trip (fish count)")}
          </span>
          <span className="flex items-center gap-1">
            <span className="size-3 rounded bg-surface-3 ring-1 ring-muted/40" /> {t("رحلة بدون صيد", "Trip without catch")}
          </span>
          {showCycle && (
            <>
              <span className="flex items-center gap-1">
                <span className="h-1 w-4 rounded-full bg-ocean" /> {t("حمل (مد قوي)", "Haml (strong tides)")}
              </span>
              <span className="flex items-center gap-1">
                <span className="h-1 w-4 rounded-full bg-warn/80" /> {t("فساد (مد ضعيف)", "Fasad (weak tides)")}
              </span>
            </>
          )}
          <button className="text-teal underline-offset-2 hover:underline" onClick={toggleCycle}>
            {showCycle ? t("إخفاء الحمل والفساد", "Hide Haml/Fasad") : t("إظهار الحمل والفساد", "Show Haml/Fasad")}
          </button>
        </div>
      </Card>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Card className="p-3">
          <div className="text-xs text-muted">{t("رحلات الشهر", "Trips")}</div>
          <div className="text-xl font-bold">{ms.trips}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted">{t("أسماك", "Fish")}</div>
          <div className="text-xl font-bold">{ms.catches}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted">{t("نجاح", "Success")}</div>
          <div className="text-xl font-bold">{pct(ms.successRate)}</div>
        </Card>
      </div>

      {showCycle && monthRows.length > 0 && (
        <Card className="mt-2 space-y-1 p-3 text-sm">
          {monthByCycle.map((x) => (
            <div key={x.c} className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5">
                <span className={cn("h-1.5 w-4 rounded-full", x.c === "hamal" ? "bg-ocean" : "bg-warn/80")} /> {t(`رحلات ال${CYCLE_LABEL[x.c].ar}`, `${CYCLE_LABEL[x.c].en} trips`)}
              </span>
              <span className="text-ink-2">
                {x.trips ? (
                  <>
                    {x.fish} {t("سمكة", "fish")} · {t("نجاح", "success")} {pct(x.successful / x.trips)} <N n={x.trips} />
                  </>
                ) : (
                  "—"
                )}
              </span>
            </div>
          ))}
          <p className="text-xs text-muted">{t("أعداد هذا الشهر فقط — للاطلاع، وليست سبباً.", "This month only — for reference, not a cause.")}</p>
        </Card>
      )}

      {selected && (
        <>
          <SectionTitle>
            {fmtDate(selected, lang, { weekday: "long" })} · {fmtHijri(hijriForDateKey(selected, hijriOffset), lang)}
          </SectionTitle>
          {showCycle &&
            (() => {
              const ci = cycleInfo(selected, hijriOffset, cycleCfg);
              return (
                <div className="mb-2 px-1">
                  <Badge tone={ci.cycle === "hamal" ? "ocean" : ci.cycle === "fasad" ? "warn" : "default"}>
                    {ci.cycle === "between" ? t(CYCLE_LABEL.between.ar, CYCLE_LABEL.between.en) : t(`${CYCLE_LABEL[ci.cycle].ar} — اليوم ${ci.day}`, `${CYCLE_LABEL[ci.cycle].en} — day ${ci.day}`)}
                  </Badge>
                </div>
              );
            })()}
          {sel.length === 0 ? (
            <p className="px-1 text-sm text-muted">{t("لا توجد رحلات في هذا اليوم.", "No trips on this day.")}</p>
          ) : (
            <div className="space-y-2">
              {sel.map((r) => (
                <div key={r.trip.id} className="space-y-1">
                  <TripCard trip={r.trip} />
                  {r.catches.length > 0 && (
                    <Card className="p-1">
                      {r.catches.map((c) => (
                        <CatchRow key={c.id} c={c} />
                      ))}
                    </Card>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <SectionTitle>
        {t("ملخص السنة", "Year summary")} — {view === "greg" ? g.year : `${h.year} ${t("هـ", "AH")}`}
      </SectionTitle>
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted">
            <tr className="border-b border-line/50">
              <th className="p-2 text-start font-medium">{t("الشهر", "Month")}</th>
              <th className="p-2 font-medium">{t("رحلات", "Trips")}</th>
              <th className="p-2 font-medium">{t("أسماك", "Fish")}</th>
              <th className="p-2 font-medium">{t("نجاح", "Success")}</th>
            </tr>
          </thead>
          <tbody>
            {yearSummary.map((m) => {
              const s = summarize(m.rows);
              return (
                <tr key={m.label} className={cn("border-b border-line/30", !s.trips && "text-muted")}>
                  <td className="p-2">{m.label}</td>
                  <td className="p-2 text-center">{s.trips || "—"}</td>
                  <td className="p-2 text-center">{s.trips ? s.catches : "—"}</td>
                  <td className="p-2 text-center">{s.trips ? pct(s.successRate) : "—"}</td>
                </tr>
              );
            })}
            <tr className="font-semibold">
              <td className="p-2">{t("المجموع", "Total")}</td>
              <td className="p-2 text-center">{yearTotal.trips}</td>
              <td className="p-2 text-center">{yearTotal.catches}</td>
              <td className="p-2 text-center">
                {pct(yearTotal.successRate)} <N n={yearTotal.trips} />
              </td>
            </tr>
          </tbody>
        </table>
      </Card>

      {view === "hijri" && (
        <Notice className="mt-3">
          <Info className="me-1 inline size-4" />
          {t(
            `التقويم الهجري محسوب (${hijriCalendarName()}) وقد يختلف يوماً عن إعلان الرؤية في الكويت. اضبط الإزاحة من الإعدادات (الحالية: ${hijriOffset > 0 ? "+" : ""}${hijriOffset}) أو صحّح تاريخ رحلة محددة من صفحة تعديلها.`,
            `Hijri dates are calculated (${hijriCalendarName()}) and may differ by a day from Kuwait's official moon sighting. Adjust the offset in Settings (current: ${hijriOffset > 0 ? "+" : ""}${hijriOffset}) or correct a single trip from its edit page.`,
          )}
        </Notice>
      )}
    </>
  );
}
