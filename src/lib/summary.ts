// Template-based catch summary. Built on the fly from the saved records, so
// it always reflects the latest edits and never alters the underlying data.
// Only real values are shown; a missing value is omitted, never replaced by a
// placeholder phrase. Values that were entered manually, calculated, or come
// from a model are marked as such.

import { fmtHijri, toHijri, parseHijri } from "./hijri";
import { MOON_LABEL, TIDE_LABEL } from "./i18n";
import { catchEnv, type Prov } from "./marine/env";
import { compass, convertWind, windUnitLabel, type WindUnit } from "./marine/units";
import { catchLocation, catchTechnique, type Index } from "./stats";
import { fmtDate, fmtTime } from "./time";
import { targetsOf } from "./trips";
import type { Catch, Dataset, EnvKind } from "./types";

type Lang = "ar" | "en";

const AR_ORD_F = ["", "الأولى", "الثانية", "الثالثة", "الرابعة", "الخامسة", "السادسة", "السابعة", "الثامنة", "التاسعة", "العاشرة"];

export function ordinal(n: number, lang: Lang): string {
  if (lang === "ar") return n <= 10 ? AR_ORD_F[n] : `رقم ${n}`;
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function tag(kind: EnvKind | "entered", lang: Lang): string {
  const m: Record<string, [string, string]> = {
    entered: ["مُدخل يدوياً", "entered manually"],
    manual: ["مُدخل يدوياً", "entered manually"],
    calculated: ["محسوب", "calculated"],
    forecast: ["توقعات", "forecast"],
    archived_forecast: ["تقدير نموذج", "model estimate"],
    reanalysis: ["إعادة تحليل", "reanalysis"],
    model: ["نموذج", "model"],
    observation: ["رصد", "observed"],
  };
  const x = m[kind];
  return x ? ` (${lang === "ar" ? x[0] : x[1]})` : "";
}

export interface CatchSummary {
  headline: string;
  lines: { label: string; value: string }[];
  closing: string | null;
  nth: number | null;
  short: string;
}

/** Position of this catch among all catches of its species (chronological, 1-based). */
export function speciesOrdinal(ds: Dataset, c: Catch): number | null {
  if (!c.species_id) return null;
  const list = ds.catches
    .filter((x) => x.species_id === c.species_id)
    .sort((a, b) => a.caught_at.localeCompare(b.caught_at) || a.id.localeCompare(b.id));
  const i = list.findIndex((x) => x.id === c.id);
  return i >= 0 ? i + 1 : null;
}

export function catchSummary(ds: Dataset, idx: Index, c: Catch, lang: Lang, windUnit: WindUnit = "kn", hijriOffset = 0): CatchSummary {
  const ar = lang === "ar";
  const sp = c.species_id ? idx.speciesById.get(c.species_id) : null;
  const trip = idx.tripById.get(c.trip_id ?? "");
  const locId = catchLocation(c, idx);
  const loc = locId ? idx.locById.get(locId) : null;
  const techId = catchTechnique(c, idx);
  const tech = techId ? idx.techById.get(techId) : null;
  const env = catchEnv(ds, c);
  const nth = speciesOrdinal(ds, c);

  // Avoid nested brackets when an English name already contains some, e.g. "Balool (grouper)".
  const paren = (x: string) => (x.includes("(") ? ` – ${x}` : ` (${x})`);
  const spName = sp ? (ar ? `${sp.name_ar}${sp.name_en ? paren(sp.name_en) : ""}` : `${sp.name_en || sp.name_ar}${paren(sp.name_ar)}`) : ar ? "سمكة غير محددة النوع" : "an unidentified fish";
  const hijri = parseHijri(c.hijri_date_override) ?? toHijri(c.caught_at, hijriOffset);
  const date = fmtDate(c.caught_at, lang, { day: "numeric", month: "long", year: "numeric" });
  const time = fmtTime(c.caught_at, lang);
  const place = loc ? (ar ? loc.name : loc.name_en || loc.name) : null;

  const techName = tech ? (ar ? tech.name_ar : tech.name_en) : null;
  const tripName = trip ? trip.title || null : null;
  const headline = ar
    ? `سجّلت صيدة ${spName}${place ? ` في ${place}` : ""} بتاريخ ${date} (${fmtHijri(hijri, "ar")}) الساعة ${time}` +
      (techName ? ` باستخدام ${techName}` : "") +
      (c.depth_m != null ? ` وعلى عمق ${c.depth_m} متر` : "") +
      (trip ? `، ضمن ${tripName ? `رحلة «${tripName}»` : "رحلة"}` : "") +
      "."
    : `You logged ${spName}${place ? ` at ${place}` : ""} on ${date} (${fmtHijri(hijri, "en")}) at ${time}` +
      (techName ? ` using ${techName}` : "") +
      (c.depth_m != null ? ` at ${c.depth_m} m depth` : "") +
      (trip ? `, on ${tripName ? `the trip “${tripName}”` : "a trip"}` : "") +
      ".";

  const lines: { label: string; value: string }[] = [];
  const add = (labelAr: string, labelEn: string, value: string | null | undefined) => {
    if (value) lines.push({ label: ar ? labelAr : labelEn, value });
  };
  const p = <T,>(x: Prov<T> | null, f: (v: T) => string) => (x ? f(x.value) + tag(x.kind, lang) : null);

  add("طريقة الصيد", "Technique", tech ? (ar ? tech.name_ar : tech.name_en) : null);
  add("العمق", "Depth", c.depth_m != null ? `${c.depth_m} ${ar ? "م" : "m"}` : trip?.water_depth_m != null ? `${trip.water_depth_m} ${ar ? "م" : "m"}${ar ? " (عمق الرحلة)" : " (trip depth)"}` : null);
  add(
    "القياسات",
    "Measurements",
    [
      c.weight_kg != null ? `${c.weight_kg} ${ar ? "كغ" : "kg"}${c.weight_is_estimate ? (ar ? " (تقديري)" : " (est.)") : ""}` : null,
      c.length_cm != null ? `${c.length_cm} ${ar ? "سم" : "cm"}${c.length_is_estimate ? (ar ? " (تقديري)" : " (est.)") : ""}` : null,
    ]
      .filter(Boolean)
      .join(" · ") || null,
  );
  const gear = [
    c.rod_reel,
    c.line_type || c.pe_rating ? `${c.line_type ?? ""}${c.pe_rating ? ` PE${c.pe_rating}` : ""}`.trim() : null,
    c.leader ? (ar ? `ليدر ${c.leader}` : `leader ${c.leader}`) : null,
    c.lure_bait,
    c.hook,
    ...ds.catch_equipment.filter((x) => x.catch_id === c.id).map((x) => ds.equipment.find((e) => e.id === x.equipment_id)?.name),
  ].filter(Boolean);
  add("المعدات", "Gear", gear.length ? gear.join(" · ") : null);
  add("طور القمر", "Moon", p(env.moon, (v) => `${MOON_LABEL[v][lang]}${env.moonIllum ? ` · ${env.moonIllum.value}%` : ""}`));
  // Time relative to the nearest turning point, from the catch's own tide snapshot.
  const tideRow = env.snapshots.find((r) => r.category === "tide" && r.kind !== "unavailable");
  const mins = typeof tideRow?.data?.minutes_from_turn === "number" ? (tideRow.data.minutes_from_turn as number) : null;
  const turnType = tideRow?.data?.nearest_turn_type as "high" | "low" | undefined;
  if (mins != null && turnType && !env.tidePhase?.kind.startsWith("entered")) {
    const abs = Math.abs(mins);
    const hh = Math.floor(abs / 60);
    const mm = abs % 60;
    const dur = ar ? `${hh ? `${hh} س ` : ""}${mm} د` : `${hh ? `${hh}h ` : ""}${mm}m`;
    const ev = turnType === "high" ? (ar ? "أعلى مد" : "high tide") : ar ? "أدنى جزر" : "low tide";
    const inW = tideRow?.data?.in_waqfa === true;
    add(
      "توقيت المد",
      "Tide timing",
      (inW ? (ar ? "خلال الوقفة — " : "during the waqfa — ") : "") + (mins < 0 ? (ar ? `قبل ${ev} بـ ${dur}` : `${dur} before ${ev}`) : ar ? `بعد ${ev} بـ ${dur}` : `${dur} after ${ev}`) + tag(tideRow!.kind, lang),
    );
  }
  if (trip) {
    const tg = targetsOf(ds, trip);
    if (tg.length)
      add(
        "المستهدف في الرحلة",
        "Trip target",
        tg.map((x) => (ar ? idx.speciesById.get(x)?.name_ar : idx.speciesById.get(x)?.name_en || idx.speciesById.get(x)?.name_ar) ?? "").join("، "),
      );
  }
  add("المد والجزر", "Tide", p(env.tidePhase, (v) => TIDE_LABEL[v][lang]) && `${p(env.tidePhase, (v) => TIDE_LABEL[v][lang])}${env.tideHeight ? ` · ${env.tideHeight.value} ${ar ? "م" : "m"} MSL` : ""}`);
  add(
    "الرياح",
    "Wind",
    env.wind
      ? `${env.windDir ? compass(env.windDir.value, lang, true) + " " : ""}${Math.round(convertWind(env.wind.value, windUnit) * 10) / 10} ${windUnitLabel(windUnit, lang)}${env.gust ? `، ${ar ? "هبات" : "gusts"} ${Math.round(convertWind(env.gust.value, windUnit))}` : ""}${tag(env.wind.kind, lang)}`
      : null,
  );
  add("ارتفاع الموج", "Wave height", p(env.wave, (v) => `${v} ${ar ? "م" : "m"}${env.wavePeriod ? ` · ${env.wavePeriod.value} ${ar ? "ث" : "s"}` : ""}`));
  add("حرارة الماء", "Sea temperature", p(env.seaTemp, (v) => `${v}°`));
  add("ملاحظات", "Notes", c.notes);
  add("الحالة", "Kept / released", c.released ? (ar ? "أُطلقت" : "released") : null);

  const closing =
    nth && sp
      ? ar
        ? nth === 1
          ? `هذه أول مرة مسجلة تصيد فيها ${sp.name_ar}.`
          : `هذه المرة ${ordinal(nth, "ar")} المسجلة التي تصيد فيها ${sp.name_ar}.`
        : `This is your ${ordinal(nth, "en")} recorded ${sp.name_en || sp.name_ar} catch.`
      : null;

  const short = [tech ? (ar ? tech.name_ar : tech.name_en) : null, env.moon ? MOON_LABEL[env.moon.value][lang] : null, env.tidePhase ? TIDE_LABEL[env.tidePhase.value][lang] : null, env.wind ? `${Math.round(convertWind(env.wind.value, windUnit))} ${windUnitLabel(windUnit, lang)}` : null]
    .filter(Boolean)
    .join(" · ");

  return { headline, lines, closing, nth, short };
}

export function summaryText(s: CatchSummary): string {
  return [s.headline, "", ...s.lines.map((l) => `${l.label}: ${l.value}`), ...(s.closing ? ["", s.closing] : [])].join("\n");
}
