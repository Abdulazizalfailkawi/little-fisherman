// All times are stored as UTC ISO strings and displayed in Kuwait time.
// Kuwait has used UTC+3 with no daylight saving since 2007, but we still
// resolve the offset through Intl so the code stays correct if that changes.

export const TZ = "Asia/Kuwait";

const partsFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
  weekday: "short",
});

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export interface KwParts {
  year: number;
  month: number; // 1..12
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 0 = Sunday
}

export function kwParts(input: Date | string): KwParts {
  const d = typeof input === "string" ? new Date(input) : input;
  const p: Record<string, string> = {};
  for (const part of partsFmt.formatToParts(d)) p[part.type] = part.value;
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour) % 24,
    minute: Number(p.minute),
    weekday: WEEKDAYS.indexOf(p.weekday),
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Kuwait calendar date "YYYY-MM-DD" for a timestamp. */
export function dateKey(input: Date | string): string {
  const p = kwParts(input);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

export function monthKey(input: Date | string): string {
  const p = kwParts(input);
  return `${p.year}-${pad(p.month)}`;
}

/** Offset of Kuwait from UTC in minutes at a given instant. */
function tzOffsetMinutes(d: Date): number {
  const p = kwParts(d);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return Math.round((asUtc - Math.floor(d.getTime() / 60000) * 60000) / 60000);
}

/** ISO -> value for <input type="datetime-local"> in Kuwait time. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const p = kwParts(iso);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** <input type="datetime-local"> value interpreted as Kuwait time -> ISO. */
export function fromLocalInput(value: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const offset = tzOffsetMinutes(new Date(guess));
  return new Date(guess - offset * 60000).toISOString();
}

/** Noon (Kuwait) on a given date key — a safe instant for "which day is this". */
export function dateKeyToDate(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 9, 0)); // 12:00 in UTC+3
}

export function addDays(key: string, n: number): string {
  const d = dateKeyToDate(key);
  d.setUTCDate(d.getUTCDate() + n);
  return dateKey(d);
}

export function todayKey(): string {
  return dateKey(new Date());
}

export function nowLocalInput(): string {
  return toLocalInput(new Date().toISOString());
}

type Lang = "ar" | "en";
const locale = (lang: Lang) => (lang === "ar" ? "ar-KW-u-nu-latn" : "en-GB");

export function fmtDate(iso: string | Date, lang: Lang, opts: Intl.DateTimeFormatOptions = {}): string {
  return new Intl.DateTimeFormat(locale(lang), {
    timeZone: TZ,
    day: "numeric",
    month: "short",
    year: "numeric",
    ...opts,
  }).format(typeof iso === "string" ? new Date(iso) : iso);
}

export function fmtTime(iso: string | Date, lang: Lang): string {
  return new Intl.DateTimeFormat(locale(lang), {
    timeZone: TZ,
    hour: "numeric",
    minute: "2-digit",
  }).format(typeof iso === "string" ? new Date(iso) : iso);
}

export function fmtDateTime(iso: string, lang: Lang): string {
  return `${fmtDate(iso, lang)} · ${fmtTime(iso, lang)}`;
}

export function fmtWeekday(day: number, lang: Lang, style: "long" | "short" = "long"): string {
  // 2023-01-01 was a Sunday
  return new Intl.DateTimeFormat(locale(lang), { weekday: style, timeZone: "UTC" }).format(
    new Date(Date.UTC(2023, 0, 1 + day, 12)),
  );
}

export function fmtMonthName(month: number, lang: Lang, style: "long" | "short" = "long"): string {
  return new Intl.DateTimeFormat(locale(lang), { month: style, timeZone: "UTC" }).format(
    new Date(Date.UTC(2023, month - 1, 15)),
  );
}

/** Trip duration in hours, or null when the end time is missing/implausible. */
export function tripHours(t: { started_at: string; ended_at: string | null }): number | null {
  if (!t.ended_at) return null;
  const h = (new Date(t.ended_at).getTime() - new Date(t.started_at).getTime()) / 3_600_000;
  if (!(h > 0) || h > 72) return null;
  return h;
}

export function fmtNumber(n: number, digits = 1): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(digits);
}
