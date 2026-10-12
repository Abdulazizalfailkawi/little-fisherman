// Hijri calendar support.
//
// We use the Umm al-Qura calendar shipped with the browser's ICU data
// (Intl "islamic-umalqura"). It is the tabulated calendar of Saudi Arabia
// and the closest widely-available match for Kuwait. Kuwait's official
// dates follow local moon sighting, so the actual date can differ by a day.
// Two correction mechanisms exist:
//   1. a global offset (-2..+2 days) in Settings
//   2. a manual Hijri date stored on an individual trip (hijri_date_override)

import { TZ, dateKey, dateKeyToDate } from "./time";

export interface HijriDate {
  year: number;
  month: number; // 1..12
  day: number;
}

let fmt: Intl.DateTimeFormat | null = null;
let calendarName = "";

function formatter(): Intl.DateTimeFormat {
  if (fmt) return fmt;
  for (const cal of ["islamic-umalqura", "islamic-civil", "islamic"]) {
    const f = new Intl.DateTimeFormat(`en-u-ca-${cal}-nu-latn`, {
      timeZone: TZ,
      year: "numeric",
      month: "numeric",
      day: "numeric",
    });
    if (f.resolvedOptions().calendar === cal) {
      fmt = f;
      calendarName = cal;
      return f;
    }
  }
  throw new Error("This browser has no Hijri calendar support");
}

/** Name of the calendar algorithm actually in use (for transparency in the UI). */
export function hijriCalendarName(): string {
  formatter();
  return calendarName;
}

export function toHijri(input: Date | string, offsetDays = 0): HijriDate {
  const d = typeof input === "string" ? new Date(input) : new Date(input.getTime());
  if (offsetDays) d.setTime(d.getTime() + offsetDays * 86_400_000);
  const p: Record<string, string> = {};
  for (const part of formatter().formatToParts(d)) p[part.type] = part.value;
  return { year: parseInt(p.year, 10), month: parseInt(p.month, 10), day: parseInt(p.day, 10) };
}

export function hijriForDateKey(key: string, offsetDays = 0): HijriDate {
  return toHijri(dateKeyToDate(key), offsetDays);
}

export function parseHijri(s: string | null | undefined): HijriDate | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const h = { year: +m[1], month: +m[2], day: +m[3] };
  if (h.month < 1 || h.month > 12 || h.day < 1 || h.day > 30) return null;
  return h;
}

export function hijriToString(h: HijriDate): string {
  return `${h.year}-${String(h.month).padStart(2, "0")}-${String(h.day).padStart(2, "0")}`;
}

/** Hijri date for a trip, honouring a manual correction when present. */
export function tripHijri(
  trip: { started_at: string; hijri_date_override: string | null },
  offsetDays = 0,
): { date: HijriDate; corrected: boolean } {
  const o = parseHijri(trip.hijri_date_override);
  if (o) return { date: o, corrected: true };
  return { date: toHijri(trip.started_at, offsetDays), corrected: false };
}

export const HIJRI_MONTHS_AR = [
  "محرم",
  "صفر",
  "ربيع الأول",
  "ربيع الآخر",
  "جمادى الأولى",
  "جمادى الآخرة",
  "رجب",
  "شعبان",
  "رمضان",
  "شوال",
  "ذو القعدة",
  "ذو الحجة",
];
export const HIJRI_MONTHS_EN = [
  "Muharram",
  "Safar",
  "Rabi al-Awwal",
  "Rabi al-Thani",
  "Jumada al-Ula",
  "Jumada al-Akhirah",
  "Rajab",
  "Sha'ban",
  "Ramadan",
  "Shawwal",
  "Dhu al-Qa'dah",
  "Dhu al-Hijjah",
];

export function hijriMonthName(month: number, lang: "ar" | "en"): string {
  return (lang === "ar" ? HIJRI_MONTHS_AR : HIJRI_MONTHS_EN)[month - 1] ?? "";
}

export function fmtHijri(h: HijriDate, lang: "ar" | "en"): string {
  return lang === "ar"
    ? `${h.day} ${hijriMonthName(h.month, lang)} ${h.year} هـ`
    : `${h.day} ${hijriMonthName(h.month, lang)} ${h.year} AH`;
}

/**
 * Gregorian date keys (Kuwait) that make up a Hijri month, in order.
 * Found by estimating the start and scanning, so it works with any
 * calendar variant the browser provides.
 */
export function hijriMonthDays(year: number, month: number, offsetDays = 0): string[] {
  // Rough estimate of the Gregorian date of 1/month/year.
  const daysSinceEpoch = (year - 1) * 354.36667 + (month - 1) * 29.5306;
  const epoch = Date.UTC(622, 6, 19, 9);
  let probe = dateKey(new Date(epoch + daysSinceEpoch * 86_400_000));
  // Walk back until we are before the month, then forward to day 1.
  for (let i = 0; i < 60; i++) {
    const h = hijriForDateKey(probe, offsetDays);
    if (h.year < year || (h.year === year && h.month < month)) break;
    probe = shift(probe, -1);
  }
  for (let i = 0; i < 90; i++) {
    const h = hijriForDateKey(probe, offsetDays);
    if (h.year === year && h.month === month) break;
    probe = shift(probe, 1);
  }
  const out: string[] = [];
  for (let i = 0; i < 31; i++) {
    const h = hijriForDateKey(probe, offsetDays);
    if (h.year !== year || h.month !== month) break;
    out.push(probe);
    probe = shift(probe, 1);
  }
  return out;
}

function shift(key: string, n: number): string {
  const d = dateKeyToDate(key);
  d.setUTCDate(d.getUTCDate() + n);
  return dateKey(d);
}

export function addHijriMonths(year: number, month: number, n: number): { year: number; month: number } {
  const idx = year * 12 + (month - 1) + n;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}
