// "أفضل أوقات الصيد" — a transparent, rule-based score for every half hour of a
// day. It is NOT a measured prediction of bites. It combines three things that
// anglers widely agree on — moving water, low light (dawn / dusk) and a
// workable sea — plus a small per-species preference, and (once the user has
// enough catches of that species) the user's own tide-phase history.

import { sunTimes } from "./astro";
import type { Pt } from "./marine/tide";
import { tideState, type TurnEvent } from "./marine/waqfa";

const MIN = 60_000;
const H = 3_600_000;

export interface Profile {
  /** extra weight (0..1) when the tide is rising (سجي) / falling (ثبر) */
  rising: number;
  falling: number;
  /** how good each light period is for this species (0..1) */
  dawn: number;
  dusk: number;
  night: number;
  day: number;
}

const BASE: Profile = { rising: 0.5, falling: 0.5, dawn: 0.9, dusk: 1, night: 0.4, day: 0.15 };

/** Rough preferences by species (Arabic name). Everything else uses BASE. */
export const PROFILES: Record<string, Partial<Profile>> = {
  شعم: { rising: 0.8, falling: 0.4, dusk: 1, dawn: 0.9, night: 0.45 },
  سبيطي: { rising: 0.8, falling: 0.4, dusk: 1, dawn: 0.9, night: 0.4 },
  بالول: { rising: 0.5, falling: 0.5, dusk: 1, dawn: 0.8, night: 0.8, day: 0.1 },
  هامور: { rising: 0.5, falling: 0.5, dusk: 1, dawn: 0.8, night: 0.8, day: 0.1 },
  زبيدي: { rising: 0.5, falling: 0.6, dusk: 0.9, dawn: 0.7, night: 0.8 },
  نويبي: { rising: 0.5, falling: 0.6, dusk: 0.9, dawn: 0.7, night: 0.8 },
  شعري: { rising: 0.6, falling: 0.5, dusk: 1, dawn: 1, night: 0.4 },
  كنعد: { rising: 0.5, falling: 0.5, dusk: 1, dawn: 1, night: 0.1, day: 0.3 },
  جيذر: { rising: 0.5, falling: 0.5, dusk: 1, dawn: 1, night: 0.1, day: 0.3 },
  جش: { rising: 0.5, falling: 0.5, dusk: 1, dawn: 1, night: 0.2, day: 0.3 },
};

export function profileFor(nameAr: string | null | undefined): Profile {
  return { ...BASE, ...(nameAr ? PROFILES[nameAr] : undefined) };
}

export interface Cond {
  windKmh?: number | null;
  waveM?: number | null;
}

export type Why = "moving" | "rising" | "falling" | "dawn" | "dusk" | "night" | "rough";

export interface Slot {
  t: number;
  score: number;
  move: number;
  light: number;
  cond: number;
  dir: "rising" | "falling" | "waqfa" | null;
  rateCm: number | null;
}

export interface BestWindow {
  from: number;
  to: number;
  score: number;
  rating: "excellent" | "good" | "fair";
  why: Why[];
}

export interface Personal {
  rising: number;
  falling: number;
  waqfa: number;
}

/** Tide speed (cm/h) that counts as "fully moving" — typical mid-tide rate in the north of the Gulf. */
export const FULL_MOVE_CM_H = 30;
export const MIN_PERSONAL = 8;

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const tri = (x: number, center: number, half: number) => clamp01(1 - Math.abs(x - center) / half);

export function lightFactor(t: number, sunrise: number | null, sunset: number | null, p: Profile): { value: number; kind: "dawn" | "dusk" | "night" | "day" } {
  if (sunrise == null || sunset == null) return { value: p.day, kind: "day" };
  const dawn = p.dawn * tri(t, sunrise + 10 * MIN, 85 * MIN);
  const dusk = p.dusk * tri(t, sunset - 10 * MIN, 85 * MIN);
  const night = t < sunrise - 60 * MIN || t > sunset + 60 * MIN ? p.night : 0;
  const day = p.day;
  const value = Math.max(dawn, dusk, night, day);
  const kind = value === dawn ? "dawn" : value === dusk ? "dusk" : value === night ? "night" : "day";
  return { value, kind };
}

export function condFactor(c: Cond): number {
  const wind = c.windKmh == null ? 1 : 1 - 0.55 * clamp01((c.windKmh - 25) / 20);
  const wave = c.waveM == null ? 1 : 1 - 0.5 * clamp01((c.waveM - 0.8) / 0.7);
  return Math.min(wind, wave);
}

export function scoreDay(opts: {
  dayStart: number; // epoch ms of 00:00 Kuwait time
  pts: Pt[];
  turns: TurnEvent[];
  lat: number;
  lng: number;
  profile: Profile;
  cond: (t: number) => Cond;
  personal?: (Personal & { n: number }) | null;
  stepMin?: number;
}): { slots: Slot[]; windows: BestWindow[]; sunrise: number | null; sunset: number | null } {
  const step = (opts.stepMin ?? 30) * MIN;
  const sun = sunTimes(new Date(opts.dayStart + 12 * H), opts.lat, opts.lng);
  const sunrise = sun.sunrise ? sun.sunrise.getTime() : null;
  const sunset = sun.sunset ? sun.sunset.getTime() : null;
  const usePersonal = !!opts.personal && opts.personal.n >= MIN_PERSONAL;

  const slots: Slot[] = [];
  const kinds: ("dawn" | "dusk" | "night" | "day")[] = [];
  for (let t = opts.dayStart; t < opts.dayStart + 24 * H; t += step) {
    const mid = t + step / 2;
    const st = opts.pts.length ? tideState(opts.pts, opts.turns, mid) : null;
    const rate = st?.rateCmPerH ?? null;
    const dir = st?.direction ?? null;
    const move = rate == null ? 0 : clamp01(Math.abs(rate) / FULL_MOVE_CM_H);
    const l = lightFactor(mid, sunrise, sunset, opts.profile);
    const cond = condFactor(opts.cond(mid));
    const dirF = dir === "rising" ? opts.profile.rising : dir === "falling" ? opts.profile.falling : 0;
    let raw = 0.5 * move + 0.35 * l.value + 0.15 * dirF;
    if (usePersonal && dir) {
      const n = opts.personal!.n;
      const share = (dir === "rising" ? opts.personal!.rising : dir === "falling" ? opts.personal!.falling : opts.personal!.waqfa) / n;
      raw *= 0.85 + 0.6 * share; // 25 % share = neutral
    }
    slots.push({ t, score: Math.round(100 * clamp01(raw) * cond), move, light: l.value, cond, dir, rateCm: rate });
    kinds.push(l.kind);
  }

  // Best windows: contiguous runs close to the day's best score.
  const max = Math.max(0, ...slots.map((s) => s.score));
  const floor = Math.max(40, max - 12);
  const runs: { a: number; b: number }[] = [];
  let cur: { a: number; b: number } | null = null;
  slots.forEach((s, i) => {
    if (s.score >= floor) {
      if (cur && i - cur.b <= 1) cur.b = i;
      else {
        cur = { a: i, b: i };
        runs.push(cur);
      }
    }
  });
  const windows: BestWindow[] = runs
    .map(({ a, b }) => {
      const part = slots.slice(a, b + 1);
      const peak = Math.max(...part.map((s) => s.score));
      const avg = (f: (s: Slot) => number) => part.reduce((x, s) => x + f(s), 0) / part.length;
      const why: Why[] = [];
      if (avg((s) => s.move) >= 0.55) {
        const rising = part.filter((s) => s.dir === "rising").length;
        const falling = part.filter((s) => s.dir === "falling").length;
        why.push(rising > falling ? "rising" : falling > rising ? "falling" : "moving");
      }
      const k = kinds.slice(a, b + 1);
      if (k.filter((x) => x === "dawn").length >= part.length / 2) why.push("dawn");
      else if (k.filter((x) => x === "dusk").length >= part.length / 2) why.push("dusk");
      else if (k.filter((x) => x === "night").length >= part.length / 2) why.push("night");
      if (avg((s) => s.cond) < 0.8) why.push("rough");
      return { from: part[0].t, to: part[part.length - 1].t + step, score: peak, rating: peak >= 70 ? ("excellent" as const) : peak >= 50 ? ("good" as const) : ("fair" as const), why };
    })
    .sort((x, y) => y.score - x.score)
    .slice(0, 3)
    .sort((x, y) => x.from - y.from);
  return { slots, windows, sunrise, sunset };
}
