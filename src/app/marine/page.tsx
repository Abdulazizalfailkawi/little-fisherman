"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarPlus, ExternalLink, LocateFixed, RefreshCw, Sunrise, Sunset, Waves, Wind } from "lucide-react";
import { SeriesLine } from "@/components/charts";
import { KindBadge } from "@/components/EnvPanel";
import { Badge, Button, Card, Choice, Empty, Field, Input, LinkButton, Notice, PageHeader, SectionTitle, Spinner } from "@/components/ui";
import { MOON_EMOJI, moonAt, sunTimes } from "@/lib/astro";
import { useStore } from "@/lib/db/store";
import { lastUsed, newTrip } from "@/lib/factory";
import { getGps } from "@/lib/gps";
import { MOON_LABEL, TIDE_LABEL, useI18n } from "@/lib/i18n";
import { getConditions, hazards, hourAt, tideAt, type ConditionsResult } from "@/lib/marine/client";
import { takeSnapshot } from "@/lib/marine/snapshots";
import { KMC_MARINE_URL } from "@/lib/marine/stations";
import { phaseToTide } from "@/lib/marine/tide";
import { compass, fmtWind, readWindUnit, saveWindUnit, type WindUnit } from "@/lib/marine/units";
import { fmtDateTime, fmtTime, fromLocalInput, nowLocalInput } from "@/lib/time";

const H = 3_600_000;

function until(ms: number, lang: "ar" | "en") {
  const m = Math.max(0, Math.round(ms / 60_000));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return lang === "ar" ? `بعد ${h} س ${mm} د` : `in ${h}h ${mm}m`;
}

export default function MarinePage() {
  const store = useStore();
  const { ds, online, save } = store;
  const { t, lang } = useI18n();
  const router = useRouter();
  const spots = useMemo(
    () => ds.locations.filter((l) => l.lat != null && l.lng != null).sort((a, b) => Number(!!b.is_favorite) - Number(!!a.is_favorite) || a.name.localeCompare(b.name, "ar")),
    [ds.locations],
  );
  const [spotId, setSpotId] = useState<string | null>(null);
  const [gpsPt, setGpsPt] = useState<{ lat: number; lng: number } | null>(null);
  const [whenIn, setWhenIn] = useState(nowLocalInput());
  const [res, setRes] = useState<ConditionsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [unit, setUnit] = useState<WindUnit>("kn");
  const [nowMs, setNowMs] = useState(Date.now());

  useEffect(() => setUnit(readWindUnit()), []);
  useEffect(() => {
    if (!spotId && spots.length) {
      const saved = typeof localStorage !== "undefined" ? localStorage.getItem("ft.marineSpot") : null;
      setSpotId(spots.find((s) => s.id === saved)?.id ?? spots[0].id);
    }
  }, [spots, spotId]);
  useEffect(() => {
    const iv = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(iv);
  }, []);

  const spot = spots.find((s) => s.id === spotId) ?? null;
  const pt = gpsPt ?? (spot ? { lat: spot.lat!, lng: spot.lng! } : null);
  const at = Date.parse(fromLocalInput(whenIn) ?? new Date().toISOString());

  const load = useCallback(
    async (force = false) => {
      if (!pt) return;
      setLoading(true);
      const r = await getConditions(pt.lat, pt.lng, new Date(at - 13 * H), new Date(at + 37 * H), { force });
      setRes(r);
      setLoading(false);
    },
    [pt?.lat, pt?.lng, at], // eslint-disable-line react-hooks/exhaustive-deps
  );
  useEffect(() => {
    void load();
  }, [load]);

  const c = res?.data ?? null;
  const w = c ? hourAt(c.weather.hours, at) : null;
  const cur = c?.current && Math.abs(at - nowMs) < H ? c.current : null;
  const m = c ? hourAt(c.marine.hours, at) : null;
  const td = c ? tideAt(c, at) : null;
  const moon = moonAt(new Date(at));
  const sun = pt ? sunTimes(new Date(at), pt.lat, pt.lng) : null;
  const warn = c ? hazards(c, at, at + 24 * H) : [];
  const hours = c ? c.weather.hours.filter((h) => Date.parse(h.t) >= at - H / 2 && Date.parse(h.t) <= at + 24 * H) : [];
  const sea = c?.tide.series.filter((p) => Date.parse(p.t) >= at - 2 * H && Date.parse(p.t) <= at + 24 * H) ?? [];
  const ext = c?.tide.extremes.filter((e) => Date.parse(e.t) >= at - 2 * H && Date.parse(e.t) <= at + 24 * H) ?? [];
  const future = at > nowMs + H;

  const planTrip = async () => {
    const trip = newTrip({ ...lastUsed(ds), location_id: gpsPt ? null : spotId, lat: gpsPt?.lat ?? null, lng: gpsPt?.lng ?? null, started_at: new Date(at).toISOString(), status: "draft" });
    await save("trips", trip);
    void takeSnapshot(store, { at: new Date(at), tripId: trip.id, catchId: null, purpose: future ? "planned" : "trip_start", coords: pt });
    router.push(`/trip?id=${trip.id}`);
  };

  return (
    <>
      <PageHeader
        title={t("لوحة البحر", "Marine dashboard")}
        actions={
          <Button size="sm" variant="secondary" loading={loading} disabled={!online || !pt} onClick={() => load(true)} aria-label="refresh">
            <RefreshCw className="size-4" />
          </Button>
        }
      />

      <Card className="space-y-3">
        {spots.length ? (
          <Field label={t("موقع الصيد", "Fishing spot")}>
            <select
              value={gpsPt ? "__gps" : spotId ?? ""}
              onChange={(e) => {
                if (e.target.value === "__gps") return;
                setGpsPt(null);
                setSpotId(e.target.value);
                try {
                  localStorage.setItem("ft.marineSpot", e.target.value);
                } catch {}
              }}
              className="min-h-12 w-full rounded-xl border border-line bg-surface-2 px-3.5"
            >
              {gpsPt && <option value="__gps">{t("موقعي الحالي (GPS)", "My current location (GPS)")}</option>}
              {spots.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.is_favorite ? "★ " : ""}
                  {lang === "ar" ? s.name : s.name_en || s.name}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <Notice>
            {t("أضف موقع صيد بإحداثيات لعرض الظروف.", "Add a fishing spot with coordinates to see conditions.")}{" "}
            <Link href="/spots" className="text-teal underline">
              {t("مواقع الصيد", "Fishing spots")}
            </Link>
          </Notice>
        )}
        <div className="flex gap-2">
          <Field label={t("وقت الصيد المخطط (الكويت)", "Planned fishing time (Kuwait)")} className="flex-1">
            <Input type="datetime-local" value={whenIn} onChange={(e) => setWhenIn(e.target.value)} />
          </Field>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="ghost" onClick={() => setWhenIn(nowLocalInput())}>
            {t("الآن", "Now")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              try {
                setGpsPt(await getGps());
              } catch {}
            }}
          >
            <LocateFixed className="size-4" /> GPS
          </Button>
          <Choice value={unit} allowClear={false} onChange={(v) => v && (setUnit(v), saveWindUnit(v))} options={[{ value: "kn", label: t("عقدة", "kn") }, { value: "kmh", label: t("كم/س", "km/h") }, { value: "ms", label: t("م/ث", "m/s") }]} />
        </div>
      </Card>

      {!pt ? null : !c && loading ? (
        <div className="grid place-items-center py-10">
          <Spinner />
        </div>
      ) : !c ? (
        <div className="mt-4">
          <Empty icon="🌊" title={t("البيانات غير متوفرة", "Data unavailable")}>
            {res?.error === "OFFLINE" ? t("لا يوجد اتصال ولا توجد نسخة محفوظة لهذا الموقع والوقت.", "Offline and no saved copy for this spot and time.") : res?.error === "TOO_FAR_AHEAD" ? t("التوقعات متاحة حتى ١٦ يوماً فقط.", "Forecasts are only available up to 16 days ahead.") : t("تعذر الاتصال بمزود البيانات.", "Couldn't reach the data provider.")}
          </Empty>
        </div>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
            <span>
              {t("آخر تحديث", "Last updated")}: {res?.savedAt ? fmtDateTime(new Date(res.savedAt).toISOString(), lang) : "—"}
            </span>
            {res?.stale && <Badge tone="warn">{t("بيانات قديمة — تعذر التحديث", "Stale — refresh failed")}</Badge>}
            {res?.fromCache && !res.stale && <Badge>{t("من الذاكرة", "Cached")}</Badge>}
          </div>

          {warn.length > 0 && (
            <Notice tone="warn" className="mt-3">
              <div className="flex items-center gap-1.5 font-semibold">
                <AlertTriangle className="size-4" /> {t("تنبيهات خلال ٢٤ ساعة", "Alerts in the next 24 h")}
              </div>
              <ul className="mt-1 list-inside list-disc">
                {warn.map((x) => (
                  <li key={x.key}>{t(x.ar, x.en)}</li>
                ))}
              </ul>
              <a href={KMC_MARINE_URL} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 underline">
                {t("راجع النشرة البحرية الرسمية", "Check the official marine bulletin")} <ExternalLink className="size-3" />
              </a>
            </Notice>
          )}

          <div className="mt-3 grid grid-cols-2 gap-2">
            <Card className="p-3.5">
              <div className="mb-1 flex items-center gap-1.5 text-xs text-muted">
                <Wind className="size-3.5" /> {t("الرياح", "Wind")}
              </div>
              {(cur ?? w)?.wind != null ? (
                <>
                  <div className="text-xl font-bold">{fmtWind((cur ?? w)!.wind, unit, lang)}</div>
                  <div className="text-xs text-ink-2">
                    {compass((cur ?? w)!.dir, lang)} · {t("هبات", "gusts")} {fmtWind((cur ?? w)!.gust, unit, lang)}
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
                  <div className="text-xl font-bold">{m.wave_h} {t("م", "m")}</div>
                  <div className="text-xs text-ink-2">
                    {m.wave_p != null ? `${m.wave_p} ${t("ث", "s")}` : ""} · {t("من", "from")} {compass(m.wave_dir, lang)}
                  </div>
                  {m.swell_h != null && (
                    <div className="text-xs text-muted">
                      {t("سويل", "Swell")} {m.swell_h} {t("م", "m")} · {m.swell_p ?? "—"} {t("ث", "s")}
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
              {(cur ?? w)?.temp != null ? (
                <>
                  <div className="text-xl font-bold">{(cur ?? w)!.temp}°</div>
                  <div className="text-xs text-ink-2">
                    {t("الإحساس", "Feels")} {(cur ?? w)!.feels ?? "—"}° · {t("رطوبة", "RH")} {(cur ?? w)!.rh ?? "—"}% · {t("غيوم", "cloud")} {(cur ?? w)!.cloud ?? "—"}%
                  </div>
                  {w?.pprob != null && <div className="text-xs text-muted">{t("احتمال مطر", "Rain chance")} {w.pprob}%</div>}
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
                  {t("التيار", "Current")} {(m.cur_v / 1.852).toFixed(1)} {t("عقدة", "kn")} → {compass(m.cur_dir, lang)}
                </div>
              )}
            </Card>
          </div>

          <SectionTitle>{t("المد والجزر", "Tide")}</SectionTitle>
          <Card className="space-y-2">
            {td && c.tide.status !== "error" ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-lg font-bold">{td.phase ? TIDE_LABEL[phaseToTide(td.phase)!][lang] : "—"}</span>
                  <span className="text-sm text-ink-2">{td.height} m MSL</span>
                  <KindBadge kind={c.tide.kind} />
                  {c.tide.station && <Badge tone="ocean">{c.tide.station}</Badge>}
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-xl bg-surface-2 p-2.5">
                    <div className="text-xs text-muted">{t("المد العالي التالي", "Next high tide")}</div>
                    {td.next_high_at ? (
                      <>
                        <b>{fmtTime(td.next_high_at, lang)}</b> · {td.next_high_m} m
                        <div className="text-xs text-muted">{until(Date.parse(td.next_high_at) - at, lang)}</div>
                      </>
                    ) : (
                      "—"
                    )}
                  </div>
                  <div className="rounded-xl bg-surface-2 p-2.5">
                    <div className="text-xs text-muted">{t("الجزر التالي", "Next low tide")}</div>
                    {td.next_low_at ? (
                      <>
                        <b>{fmtTime(td.next_low_at, lang)}</b> · {td.next_low_m} m
                        <div className="text-xs text-muted">{until(Date.parse(td.next_low_at) - at, lang)}</div>
                      </>
                    ) : (
                      "—"
                    )}
                  </div>
                </div>
                {sea.length > 3 && (
                  <SeriesLine
                    data={sea.map((p) => ({ t: Date.parse(p.t), v: p.h }))}
                    now={at}
                    unit="m"
                    marks={ext.map((e) => ({ t: Date.parse(e.t), v: e.h, label: `${e.type === "high" ? "▲" : "▼"} ${fmtTime(e.t, lang)}` }))}
                  />
                )}
                <p className="text-xs leading-relaxed text-muted">{lang === "ar" ? "مستوى البحر من نموذج محيطي (شبكة ~٥–٩ كم، مرجع متوسط سطح البحر) وليس جدول مد رسمياً ولا يصلح للملاحة؛ قد تختلف الأوقات والارتفاعات قرب الساحل." : c.tide.note}</p>
              </>
            ) : (
              <Notice>
                {t("بيانات المد والجزر غير متوفرة لهذا الموقع/الوقت.", "Tide data unavailable for this spot/time.")}
              </Notice>
            )}
            <a href={KMC_MARINE_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-teal underline">
              {t("جداول المد الرسمية (الشويخ، الشعيبة) — الأرصاد الجوية الكويتية", "Official tide tables (Shuwaikh, Shuaiba) — Kuwait Meteorological Center")} <ExternalLink className="size-3" />
            </a>
          </Card>

          <SectionTitle>{t("الشمس والقمر", "Sun & moon")}</SectionTitle>
          <Card className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-1">
              <Sunrise className="size-4 text-warn" /> {sun?.sunrise ? fmtTime(sun.sunrise, lang) : "—"}
            </span>
            <span className="flex items-center gap-1">
              <Sunset className="size-4 text-warn" /> {sun?.sunset ? fmtTime(sun.sunset, lang) : "—"}
            </span>
            <span>
              {MOON_EMOJI[moon.phase]} {MOON_LABEL[moon.phase][lang]} · {Math.round(moon.illumination * 100)}%
            </span>
            <KindBadge kind="calculated" />
          </Card>

          <SectionTitle>{t("الساعات القادمة", "Next 24 hours")}</SectionTitle>
          {hours.some((h) => h.wind != null) && (
            <Card className="mb-2">
              <div className="mb-1 text-xs text-muted">{t(`سرعة الرياح (${unit})`, `Wind speed (${unit})`)}</div>
              <SeriesLine data={hours.map((h) => ({ t: Date.parse(h.t), v: h.wind == null ? null : unit === "kn" ? h.wind / 1.852 : unit === "ms" ? h.wind / 3.6 : h.wind }))} now={at} unit={unit} digits={1} height={140} />
            </Card>
          )}
          <Card className="overflow-x-auto p-0">
            <table className="w-full text-xs">
              <thead className="text-muted">
                <tr className="border-b border-line/50">
                  <th className="p-2 text-start font-medium">{t("الوقت", "Time")}</th>
                  <th className="p-2 font-medium">{t("رياح", "Wind")}</th>
                  <th className="p-2 font-medium">{t("هبات", "Gust")}</th>
                  <th className="p-2 font-medium">{t("موج م", "Wave m")}</th>
                  <th className="p-2 font-medium">°C</th>
                  <th className="p-2 font-medium">{t("مطر", "Rain")}</th>
                </tr>
              </thead>
              <tbody>
                {hours.map((h) => {
                  const mh = hourAt(c.marine.hours, Date.parse(h.t));
                  return (
                    <tr key={h.t} className="border-b border-line/30">
                      <td className="p-2">{fmtTime(h.t, lang)}</td>
                      <td className="p-2 text-center">
                        {h.wind != null ? fmtWind(h.wind, unit, lang).split(" ")[0] : "—"} <span className="text-muted">{compass(h.dir, lang)}</span>
                      </td>
                      <td className="p-2 text-center">{h.gust != null ? fmtWind(h.gust, unit, lang).split(" ")[0] : "—"}</td>
                      <td className="p-2 text-center">{mh?.wave_h ?? "—"}</td>
                      <td className="p-2 text-center">{h.temp ?? "—"}</td>
                      <td className="p-2 text-center">{h.pprob != null ? `${h.pprob}%` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>

          <SectionTitle>{t("مصادر البيانات", "Data sources")}</SectionTitle>
          <Card className="space-y-2 text-xs text-ink-2">
            {[c.weather, c.marine].map((b) => (
              <div key={b.endpoint}>
                <div className="flex flex-wrap items-center gap-2">
                  <b>{b.source}</b>
                  <Badge tone={b.status === "ok" ? "good" : b.status === "partial" ? "warn" : "bad"}>{b.status}</Badge>
                </div>
                {b.grid && (
                  <div className="text-muted">
                    {t("نقطة الشبكة", "Grid point")} <span className="ltr">{b.grid.lat.toFixed(3)}, {b.grid.lng.toFixed(3)}</span>
                  </div>
                )}
                {b.error && <div className="text-bad">{b.error}</div>}
                <div className="text-muted">
                  {Object.entries(b.availability)
                    .filter(([, v]) => v.valid < v.total)
                    .map(([k, v]) => `${k}: ${v.valid}/${v.total}`)
                    .join(" · ") || t("كل المتغيرات متوفرة", "All variables available")}
                </div>
              </div>
            ))}
            <div>
              <b>{c.tide.source}</b> — {c.tide.method}
            </div>
            <div className="text-muted">
              {t("جُلب من المزود", "Retrieved from provider")}: {fmtDateTime(c.fetched_at, lang)} · {c.attribution}
            </div>
            <div className="text-muted">
              {t("الأوقات بتوقيت الكويت. القيم «توقعات» أو «تقدير نموذج» وليست قياسات من موقعك.", "Times in Kuwait time. Values are forecasts or model estimates, not measurements at your spot.")}
            </div>
          </Card>

          <div className="mt-4">
            <Button className="w-full" onClick={planTrip}>
              <CalendarPlus className="size-4" /> {future ? t("خطط رحلة لهذا الوقت والموقع", "Plan a trip for this time & spot") : t("ابدأ رحلة هنا الآن", "Start a trip here now")}
            </Button>
          </div>
        </>
      )}
      {!pt && spots.length === 0 && (
        <div className="mt-4">
          <LinkButton href="/spots" variant="secondary" className="w-full">
            {t("إضافة موقع صيد", "Add a fishing spot")}
          </LinkButton>
        </div>
      )}
    </>
  );
}
