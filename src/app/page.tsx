"use client";

// البحر — the home screen: live tide (سجي / ثبر / الوقفة), countdown to the
// next turning point, high/low events, interactive 24 h tide chart and marine
// conditions for the selected fishing spot. All times in Asia/Kuwait.

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, ChevronDown, ExternalLink, Fish, LocateFixed, MapPin, PencilLine, Plus, RefreshCw, Sunrise, Sunset, Timer, Waves, Wind } from "lucide-react";
import { KindBadge } from "@/components/EnvPanel";
import { ManualTideForm, readManualTide } from "@/components/ManualTide";
import { TideChart } from "@/components/TideChart";
import { Badge, Button, Card, Empty, LinkButton, Notice, Sheet, Spinner, cn } from "@/components/ui";
import { SyncBadge } from "@/components/SyncBadge";
import { MOON_EMOJI, moonAt, sunTimes } from "@/lib/astro";
import { useStore } from "@/lib/db/store";
import { getGps } from "@/lib/gps";
import { fmtHijri, toHijri } from "@/lib/hijri";
import { useNow } from "@/lib/hooks/useNow";
import { MOON_LABEL, useI18n } from "@/lib/i18n";
import { getConditions, hazards, hourAt, turnsOf, type ConditionsResult } from "@/lib/marine/client";
import { KMC_MARINE_URL } from "@/lib/marine/stations";
import { compass, fmtWind, readWindUnit, type WindUnit } from "@/lib/marine/units";
import { tideState, turningPointsFromEvents, type TurnEvent } from "@/lib/marine/waqfa";
import { CYCLE_LABEL, cycleInfo, readCycleConfig } from "@/lib/tidecycle";
import { dateKey, fmtDate, fmtDateTime, fmtTime } from "@/lib/time";
import { isActiveStatus } from "@/lib/types";

const H = 3_600_000;
const STALE_MS = 6 * H;

function hms(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}
function remain(ms: number, lang: "ar" | "en") {
  const m = Math.max(0, Math.round(ms / 60_000));
  return lang === "ar" ? `بعد ${Math.floor(m / 60)} س ${m % 60} د` : `in ${Math.floor(m / 60)}h ${m % 60}m`;
}

export default function MarineHome() {
  const store = useStore();
  const { ds, idx, online, hijriOffset } = store;
  const { t, lang } = useI18n();
  const now = useNow(1000);
  const [unit, setUnit] = useState<WindUnit>("kn");
  const [spotId, setSpotId] = useState<string | null>(null);
  const [gpsPt, setGpsPt] = useState<{ lat: number; lng: number } | null>(null);
  const [res, setRes] = useState<ConditionsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [sel, setSel] = useState<number | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualRev, setManualRev] = useState(0);
  const [showHours, setShowHours] = useState(false);
  const [gpsErr, setGpsErr] = useState<string | null>(null);

  const spots = useMemo(
    () => ds.locations.filter((l) => l.lat != null && l.lng != null).sort((a, b) => Number(!!b.is_favorite) - Number(!!a.is_favorite) || a.name.localeCompare(b.name, "ar")),
    [ds.locations],
  );
  useEffect(() => setUnit(readWindUnit()), []);
  useEffect(() => {
    if (spotId || !spots.length) return;
    let saved: string | null = null;
    try {
      saved = localStorage.getItem("ft.marineSpot");
    } catch {}
    setSpotId(spots.find((s) => s.id === saved)?.id ?? spots[0].id);
  }, [spots, spotId]);

  const spot = spots.find((s) => s.id === spotId) ?? null;
  const pt = gpsPt ?? (spot ? { lat: spot.lat!, lng: spot.lng! } : null);
  const hourKey = Math.floor(now / H);

  const load = useCallback(
    async (force = false) => {
      if (!pt) return;
      setLoading(true);
      const base = hourKey * H;
      setRes(await getConditions(pt.lat, pt.lng, new Date(base - 14 * H), new Date(base + 38 * H), { force }));
      setLoading(false);
    },
    [pt?.lat, pt?.lng, hourKey], // eslint-disable-line react-hooks/exhaustive-deps
  );
  useEffect(() => {
    void load();
  }, [load]);

  const c = res?.data ?? null;
  const today = dateKey(new Date(now));
  const manual = useMemo(() => (spotId ? readManualTide(spotId, today) : null), [spotId, today, manualRev]); // eslint-disable-line react-hooks/exhaustive-deps
  const model = useMemo(() => (c ? turnsOf(c) : { pts: [], turns: [] as TurnEvent[] }), [c]);
  const manualTurns = useMemo(() => (manual ? turningPointsFromEvents(manual.events) : null), [manual]);
  const turns = manualTurns && manualTurns.some((x) => x.t > now) ? manualTurns : model.turns;
  const usingManual = turns === manualTurns;
  const st = tideState(usingManual ? [] : model.pts, turns, now);
  const stale = !!res?.savedAt && now - res.savedAt > STALE_MS;
  const fetchedAge = c ? now - Date.parse(c.fetched_at) : 0;

  // When the last loaded turning point has passed, fetch a newer window.
  useEffect(() => {
    if (c && !usingManual && model.turns.length && !model.turns.some((x) => x.t > now) && online) void load(true);
  }, [c, usingManual, model.turns, now, online, load]);

  const w = c ? hourAt(c.weather.hours, now) : null;
  const cur = c?.current ?? null;
  const wx = cur ?? w;
  const m = c ? hourAt(c.marine.hours, now) : null;
  const moon = moonAt(new Date(now));
  const sun = pt ? sunTimes(new Date(now), pt.lat, pt.lng) : null;
  const warn = c ? hazards(c, now, now + 24 * H) : [];
  const hijri = toHijri(new Date(now), hijriOffset);
  const cyc = cycleInfo(today, hijriOffset, readCycleConfig());
  const active = ds.trips.find((x) => isActiveStatus(x.status));
  const chartFrom = now - 2 * H;
  const chartTo = now + 24 * H;
  const selState = sel != null ? tideState(usingManual ? [] : model.pts, turns, sel) : null;

  const dirLabel = (d: string | null) =>
    d === "rising" ? t("سجي", "Saji · rising") : d === "falling" ? t("ثبر", "Thabr · falling") : d === "waqfa" ? t("وقفة", "Waqfa · slack") : "—";
  const dirColor = (d: string | null) => (d === "rising" ? "text-rise" : d === "falling" ? "text-fall" : "text-warn");
  const tideSource = usingManual ? t(`يدوي — ${manual!.station === "shuwaikh" ? "الشويخ" : manual!.station === "shuaiba" ? "الشعيبة" : "مصدر آخر"}`, `Manual — ${manual!.station}`) : c?.tide.source ?? "";

  return (
    <>
      {/* Header */}
      <header className="no-print sticky top-0 z-30 -mx-4 mb-3 border-b border-line/40 bg-navy/85 px-4 pb-3 pt-[calc(var(--safe-top)+0.75rem)] backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <div className="relative">
              <select
                aria-label={t("موقع الصيد", "Fishing spot")}
                value={gpsPt ? "__gps" : spotId ?? ""}
                onChange={(e) => {
                  if (e.target.value === "__gps") return;
                  setGpsPt(null);
                  setSpotId(e.target.value);
                  setSel(null);
                  try {
                    localStorage.setItem("ft.marineSpot", e.target.value);
                  } catch {}
                }}
                className="w-full appearance-none truncate bg-transparent pe-6 text-xl font-bold focus:outline-none"
              >
                {gpsPt && <option value="__gps">{t("موقعي (GPS)", "My location (GPS)")}</option>}
                {!spots.length && <option value="">{t("لا يوجد موقع", "No spot")}</option>}
                {spots.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.is_favorite ? "★ " : ""}
                    {lang === "ar" ? s.name : s.name_en || s.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute end-0 top-1.5 size-5 text-muted" />
            </div>
            <div className="truncate text-xs text-ink-2">
              <span className="ltr font-semibold text-ink">{new Intl.DateTimeFormat(lang === "ar" ? "ar-KW-u-nu-latn" : "en-GB", { timeZone: "Asia/Kuwait", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(new Date(now))}</span>
              {" · "}
              {fmtDate(new Date(now), lang, { weekday: "short" })} · {fmtHijri(hijri, lang)}
            </div>
          </div>
          <button
            aria-label="GPS"
            onClick={async () => {
              setGpsErr(null);
              try {
                setGpsPt(await getGps());
                setSel(null);
              } catch (e) {
                setGpsErr((e as Error).message === "DENIED" ? t("تم رفض إذن الموقع", "Location permission denied") : t("تعذر تحديد الموقع", "Location unavailable"));
              }
            }}
            className="grid size-10 place-items-center rounded-full border border-line bg-surface-2"
          >
            <LocateFixed className="size-5" />
          </button>
          <button aria-label="refresh" disabled={!online || !pt || loading} onClick={() => load(true)} className="grid size-10 place-items-center rounded-full border border-line bg-surface-2 disabled:opacity-40">
            <RefreshCw className={cn("size-5", loading && "animate-spin")} />
          </button>
          <SyncBadge />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
          {cyc.cycle !== "between" && <Badge tone={cyc.cycle === "hamal" ? "ocean" : "warn"}>{t(`${CYCLE_LABEL[cyc.cycle].ar} — اليوم ${cyc.day}`, `${CYCLE_LABEL[cyc.cycle].en} — day ${cyc.day}`)}</Badge>}
          <Badge>
            {MOON_EMOJI[moon.phase]} {MOON_LABEL[moon.phase][lang]} {Math.round(moon.illumination * 100)}%
          </Badge>
          {sun?.sunrise && (
            <Badge>
              <Sunrise className="size-3" /> {fmtTime(sun.sunrise, lang)}
            </Badge>
          )}
          {sun?.sunset && (
            <Badge>
              <Sunset className="size-3" /> {fmtTime(sun.sunset, lang)}
            </Badge>
          )}
        </div>
        {gpsErr && <p className="mt-1 text-xs text-warn">{gpsErr}</p>}
      </header>

      {/* Active trip / new trip */}
      {active ? (
        <Card className="mb-3 flex items-center justify-between gap-2 border-teal/40">
          <div className="min-w-0">
            <div className="text-xs text-teal">{t("رحلة جارية", "Active trip")}</div>
            <div className="truncate font-semibold">{active.title || (active.location_id && idx.locById.get(active.location_id)?.name) || t("رحلة صيد", "Fishing trip")}</div>
            <div className="text-xs text-muted">
              {(idx.catchesByTrip.get(active.id) ?? []).length} {t("صيدة", "catches")}
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <LinkButton href={`/catch/edit?trip=${active.id}`} variant="teal">
              <Fish className="size-5" /> {t("سجّل صيدة", "Log catch")}
            </LinkButton>
            <LinkButton href={`/trip?id=${active.id}`} variant="secondary">
              {t("الرحلة", "Trip")}
            </LinkButton>
          </div>
        </Card>
      ) : (
        <LinkButton href="/trip/edit" size="lg" className="mb-3 w-full">
          <Plus className="size-5" /> {t("رحلة جديدة", "New trip")}
        </LinkButton>
      )}

      {!pt ? (
        <Empty
          icon="📍"
          title={t("اختر موقع صيد", "Choose a fishing spot")}
          action={
            <LinkButton href="/spots">
              <MapPin className="size-4" /> {t("أضف موقعاً بإحداثيات", "Add a spot with coordinates")}
            </LinkButton>
          }
        >
          {t("أضف موقعك المفضل (مثل الفنطاس) من الخريطة، أو اضغط GPS بالأعلى.", "Add your favourite spot (e.g. Al-Fintas) on the map, or tap GPS above.")}
        </Empty>
      ) : !c && loading ? (
        <div className="grid place-items-center py-16">
          <Spinner />
        </div>
      ) : (
        <>
          {res?.error && !c && (
            <Notice tone="warn">{res.error === "OFFLINE" ? t("لا يوجد اتصال ولا توجد بيانات محفوظة لهذا الموقع.", "Offline and no saved data for this spot.") : t("تعذر الاتصال بمصدر البيانات.", "Couldn't reach the data provider.")}</Notice>
          )}
          {(stale || res?.stale) && c && (
            <Notice tone="warn" className="mb-3">
              {t(`بيانات قديمة (جُلبت ${fmtDateTime(c.fetched_at, "ar")}) — تعذر التحديث.`, `Stale data (fetched ${fmtDateTime(c.fetched_at, "en")}) — refresh failed.`)}
            </Notice>
          )}

          {/* Tide phase + waqfa countdown */}
          <div className="grid grid-cols-2 gap-2">
            <Card className="p-3.5">
              <div className="text-xs text-muted">{t("حالة الماء الآن", "Tide now")}</div>
              {st.direction ? (
                <>
                  <div className={cn("mt-1 flex items-center gap-1.5 text-3xl font-extrabold", dirColor(st.direction))}>
                    {st.direction === "rising" ? <ArrowUp className="size-8" strokeWidth={3} /> : st.direction === "falling" ? <ArrowDown className="size-8" strokeWidth={3} /> : <Timer className="size-7" />}
                    {dirLabel(st.direction)}
                  </div>
                  <div className="mt-1 text-xs text-ink-2">
                    {st.level != null && (
                      <bdi>
                        {st.level} {t("م", "m")}
                      </bdi>
                    )}
                    {st.rateCmPerH != null && (
                      <span className="text-muted">
                        {" · "}
                        <bdi>
                          {st.rateCmPerH > 0 ? "+" : ""}
                          {st.rateCmPerH} {t("سم/ساعة", "cm/h")}
                        </bdi>
                      </span>
                    )}
                  </div>
                  {st.next && (
                    <div className="mt-1 text-xs text-muted">
                      {t("التحول التالي", "Next turn")}: {fmtTime(st.next.t, lang)}
                    </div>
                  )}
                </>
              ) : (
                <div className="mt-2 text-sm text-muted">{t("بيانات المد غير متوفرة", "Tide data unavailable")}</div>
              )}
            </Card>

            <Card className="border-warn/30 p-3.5">
              <div className="text-xs text-warn">{st.direction === "waqfa" ? t("في الوقفة الآن", "In the waqfa now") : t("الوقفة القادمة", "Next waqfa")}</div>
              {st.turn ? (
                <>
                  <div className="ltr mt-1 text-start font-mono text-3xl font-extrabold tabular-nums">
                    {st.direction === "waqfa" && st.turn.waqfaEnd ? hms(st.turn.waqfaEnd - now) : hms((st.turn.waqfaStart ?? st.turn.t) - now)}
                  </div>
                  <div className="text-xs text-ink-2">
                    {st.turn.type === "high" ? t("سجي ← ثبر", "Saji → Thabr") : t("ثبر ← سجي", "Thabr → Saji")} · {t("التحول", "turn")} {fmtTime(st.turn.t, lang)}
                  </div>
                  {st.turn.waqfaStart != null && st.turn.waqfaEnd != null ? (
                    <div className="text-[11px] text-muted">
                      {t("الوقفة تقريباً", "Waqfa approx.")} {fmtTime(st.turn.waqfaStart, lang)}–{fmtTime(st.turn.waqfaEnd, lang)}
                      {st.turn.uncertaintyMin ? ` · ±${st.turn.uncertaintyMin} ${t("د", "min")}` : ""}
                    </div>
                  ) : (
                    <div className="text-[11px] text-muted">{t("وقت الحدث فقط — مدة الوقفة غير معروفة", "Event time only — waqfa duration unknown")}</div>
                  )}
                  <div className="mt-1 text-[10px] text-warn/90">{t("وقت متوقع وليس مؤكداً", "Predicted, not guaranteed")}</div>
                </>
              ) : (
                <div className="mt-2 text-sm text-muted">{t("بيانات الوقفة غير متوفرة حالياً", "Waqfa data currently unavailable")}</div>
              )}
            </Card>
          </div>

          {/* High / low */}
          <div className="mt-2 grid grid-cols-2 gap-2">
            {[
              { e: st.nextHigh, l: t("أعلى مد", "High tide"), cls: "text-rise", Icon: ArrowUp },
              { e: st.nextLow, l: t("أدنى جزر", "Low tide"), cls: "text-fall", Icon: ArrowDown },
            ].map(({ e, l, cls, Icon }) => (
              <Card key={l} className="p-3.5">
                <div className={cn("flex items-center gap-1 text-xs", cls)}>
                  <Icon className="size-3.5" /> {l}
                </div>
                {e ? (
                  <>
                    <div className="mt-1 text-2xl font-bold">{fmtTime(e.t, lang)}</div>
                    <div className="text-xs text-ink-2">
                      {e.h != null ? (
                        <>
                          <bdi>
                            {e.h} {t("م", "m")}
                          </bdi>
                          {" · "}
                        </>
                      ) : null}
                      {remain(e.t - now, lang)}
                    </div>
                  </>
                ) : (
                  <div className="mt-2 text-sm text-muted">—</div>
                )}
              </Card>
            ))}
          </div>

          {/* Interactive chart */}
          <Card className="mt-2 p-3">
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold">{t("منحنى المد — ٢٤ ساعة", "Tide — 24 hours")}</span>
              {sel != null && (
                <button className="text-xs text-teal" onClick={() => setSel(null)}>
                  {t("عودة للآن", "Back to now")}
                </button>
              )}
            </div>
            {!usingManual && model.pts.length > 3 ? (
              <>
                <div className="mb-1 min-h-10 rounded-xl bg-surface-2 px-3 py-1.5 text-sm">
                  {sel != null && selState ? (
                    <div className="flex flex-wrap items-center gap-x-3">
                      <b className="ltr">{fmtTime(sel, lang)}</b>
                      <span className={dirColor(selState.direction)}>{dirLabel(selState.direction)}</span>
                      {selState.level != null && (
                        <bdi>
                          {selState.level} {t("م", "m")}
                        </bdi>
                      )}
                      {selState.next && (
                        <span className="text-xs text-muted">
                          {selState.next.type === "high" ? t("أعلى مد", "High") : t("أدنى جزر", "Low")} {remain(selState.next.t - sel, lang)}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-muted">{t("اسحب على المنحنى لمعرفة المد في أي وقت", "Drag across the curve to inspect any time")}</span>
                  )}
                </div>
                <TideChart pts={model.pts} turns={model.turns} from={chartFrom} to={chartTo} now={now} selected={sel} onSelect={setSel} />
                <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-muted">
                  <span className="flex items-center gap-1">
                    <span className="h-1 w-4 rounded-full bg-rise" /> {t("سجي", "Saji (rising)")}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-1 w-4 rounded-full bg-fall" /> {t("ثبر", "Thabr (falling)")}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-3 w-4 rounded-sm bg-warn/20" /> {t("وقفة تقديرية", "Estimated waqfa")}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-0 w-4 border-t-2 border-dashed border-warn" /> {t("الآن", "now")}
                  </span>
                </div>
              </>
            ) : usingManual ? (
              <p className="text-sm text-muted">{t("تستخدم أوقاتاً يدوية لهذا اليوم — لا يوجد منحنى مُقاس، فلا نرسم منحنى مخترعاً.", "Using manual times for today — no measured curve, so none is drawn.")}</p>
            ) : (
              <p className="text-sm text-muted">{t("بيانات مستوى البحر غير متوفرة لهذا الموقع.", "Sea-level data unavailable for this spot.")}</p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted">
              <KindBadge kind={usingManual ? "manual" : (c?.tide.kind ?? "unavailable")} />
              <span className="truncate">{tideSource}</span>
              {c && !usingManual && <span>· {t("جُلب", "fetched")} {fmtTime(c.fetched_at, lang)}</span>}
            </div>
            {!usingManual && c?.tide.status !== "unavailable" && (
              <p className="mt-1 text-[11px] leading-relaxed text-muted">
                {t(
                  "تنبؤ من نموذج مستوى البحر (Open-Meteo، شبكة ~٥–٩ كم، مرجع متوسط سطح البحر) — ليس جدولاً رسمياً ولا للملاحة. الوقفة = الفترة التي يتغير فيها المنسوب أقل من ٥ سم/ساعة حول التحول؛ الماء لا يتوقف فعلياً وقد تختلف التيارات محلياً.",
                  "Prediction from a sea-level model (Open-Meteo, ~5–9 km grid, MSL datum) — not an official table, not for navigation. Waqfa = period where the level changes < 5 cm/h around the turn; water doesn't truly stop and local currents may differ.",
                )}
              </p>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              {spotId && (
                <Button size="sm" variant="secondary" onClick={() => setManualOpen(true)}>
                  <PencilLine className="size-4" /> {usingManual ? t("تعديل الأوقات اليدوية", "Edit manual times") : t("إدخال أوقات رسمية يدوياً", "Enter official times")}
                </Button>
              )}
              <a href={KMC_MARINE_URL} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-1 px-2 text-xs text-teal underline">
                {t("الجدول الرسمي", "Official table")} <ExternalLink className="size-3" />
              </a>
            </div>
          </Card>

          {warn.length > 0 && (
            <Notice tone="warn" className="mt-2">
              <div className="flex items-center gap-1.5 font-semibold">
                <AlertTriangle className="size-4" /> {t("تنبيهات خلال ٢٤ ساعة", "Alerts in the next 24 h")}
              </div>
              <ul className="mt-1 list-inside list-disc">
                {warn.map((x) => (
                  <li key={x.key}>{t(x.ar, x.en)}</li>
                ))}
              </ul>
              <a href={KMC_MARINE_URL} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 underline">
                {t("النشرة البحرية الرسمية", "Official marine bulletin")} <ExternalLink className="size-3" />
              </a>
            </Notice>
          )}

          {/* Conditions */}
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Card className="p-3.5">
              <div className="mb-1 flex items-center gap-1.5 text-xs text-muted">
                <Wind className="size-3.5" /> {t("الرياح", "Wind")}
              </div>
              {wx?.wind != null ? (
                <>
                  <div className="text-xl font-bold">{fmtWind(wx.wind, unit, lang)}</div>
                  <div className="text-xs text-ink-2">
                    {compass(wx.dir, lang)} · {t("هبات", "gusts")} {fmtWind(wx.gust, unit, lang)}
                  </div>
                </>
              ) : (
                <div className="text-sm text-muted">{t("غير متوفر", "Unavailable")}</div>
              )}
              <div className="mt-1">
                <KindBadge kind={cur ? "forecast" : (w?.k ?? "unavailable")} />
              </div>
            </Card>
            <Card className="p-3.5">
              <div className="mb-1 flex items-center gap-1.5 text-xs text-muted">
                <Waves className="size-3.5" /> {t("الموج", "Waves")}
              </div>
              {m?.wave_h != null ? (
                <>
                  <div className="text-xl font-bold">
                    {m.wave_h} {t("م", "m")}
                  </div>
                  <div className="text-xs text-ink-2">
                    {m.wave_p != null ? `${m.wave_p} ${t("ث", "s")} · ` : ""}
                    {t("من", "from")} {compass(m.wave_dir, lang)}
                  </div>
                  {m.swell_h != null && (
                    <div className="text-xs text-muted">
                      {t("سويل", "Swell")} {m.swell_h} {t("م", "m")} · {t("موج رياح", "wind waves")} {m.wind_wave_h ?? "—"} {t("م", "m")}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-sm text-muted">{t("غير متوفر", "Unavailable")}</div>
              )}
              <div className="mt-1">
                <KindBadge kind={m?.k ?? "unavailable"} />
              </div>
            </Card>
            <Card className="p-3.5">
              <div className="mb-1 text-xs text-muted">{t("الطقس", "Weather")}</div>
              {wx?.temp != null ? (
                <>
                  <div className="text-xl font-bold">{wx.temp}°</div>
                  <div className="text-xs text-ink-2">
                    {t("الإحساس", "Feels")} {wx.feels ?? "—"}° · {t("رطوبة", "RH")} {wx.rh ?? "—"}%
                  </div>
                  {w?.pprob != null && (
                    <div className="text-xs text-muted">
                      {t("احتمال مطر", "Rain chance")} {w.pprob}%
                    </div>
                  )}
                </>
              ) : (
                <div className="text-sm text-muted">{t("غير متوفر", "Unavailable")}</div>
              )}
            </Card>
            <Card className="p-3.5">
              <div className="mb-1 text-xs text-muted">{t("حرارة الماء", "Sea temperature")}</div>
              {m?.sst != null ? <div className="text-xl font-bold">{m.sst}°</div> : <div className="text-sm text-muted">{t("غير متوفر", "Unavailable")}</div>}
              {m?.cur_v != null && (
                <div className="text-xs text-ink-2">
                  {t("التيار (نموذج)", "Current (model)")} {(m.cur_v / 1.852).toFixed(1)} {t("عقدة", "kn")}
                </div>
              )}
            </Card>
          </div>

          {c && (
            <Card className="mt-2 p-0">
              <button className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold" onClick={() => setShowHours((v) => !v)}>
                {t("الساعات القادمة", "Hour by hour")} <ChevronDown className={cn("size-4 transition-transform", showHours && "rotate-180")} />
              </button>
              {showHours && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-muted">
                      <tr className="border-b border-line/50">
                        <th className="p-2 text-start font-medium">{t("الوقت", "Time")}</th>
                        <th className="p-2 font-medium">{t("المد", "Tide")}</th>
                        <th className="p-2 font-medium">{t("رياح", "Wind")}</th>
                        <th className="p-2 font-medium">{t("موج", "Wave")}</th>
                        <th className="p-2 font-medium">°C</th>
                      </tr>
                    </thead>
                    <tbody>
                      {c.weather.hours
                        .filter((h) => Date.parse(h.t) >= now - H / 2 && Date.parse(h.t) <= now + 24 * H)
                        .map((h) => {
                          const tt = Date.parse(h.t);
                          const mh = hourAt(c.marine.hours, tt);
                          const s2 = tideState(model.pts, model.turns, tt);
                          return (
                            <tr key={h.t} className="border-b border-line/30">
                              <td className="p-2">{fmtTime(tt, lang)}</td>
                              <td className={cn("p-2 text-center", dirColor(s2.direction))}>{s2.direction ? dirLabel(s2.direction) : "—"}</td>
                              <td className="p-2 text-center">
                                {h.wind != null ? fmtWind(h.wind, unit, lang).split(" ")[0] : "—"} <span className="text-muted">{compass(h.dir, lang)}</span>
                              </td>
                              <td className="p-2 text-center">{mh?.wave_h ?? "—"}</td>
                              <td className="p-2 text-center">{h.temp ?? "—"}</td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}

          {c && (
            <p className="mt-3 px-1 text-[11px] leading-relaxed text-muted">
              {c.weather.source} · {c.marine.source}. {t("آخر تحديث", "Last update")}: {fmtDateTime(c.fetched_at, lang)}
              {fetchedAge > H ? t(" (منذ أكثر من ساعة)", " (over an hour ago)") : ""}. {c.attribution} {t("القيم توقعات/تقديرات نماذج وليست قياسات من موقعك.", "Values are forecasts/model estimates, not measurements at your spot.")}
            </p>
          )}
        </>
      )}

      <Sheet open={manualOpen} onClose={() => setManualOpen(false)} title={t("أوقات المد الرسمية — اليوم", "Official tide times — today")}>
        {spotId && (
          <ManualTideForm
            spot={spotId}
            day={today}
            onDone={() => {
              setManualOpen(false);
              setManualRev((v) => v + 1);
            }}
          />
        )}
      </Sheet>
    </>
  );
}
