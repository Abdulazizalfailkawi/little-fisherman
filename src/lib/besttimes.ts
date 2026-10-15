// "أفضل أوقات الصيد" — a transparent, rule-based score for every half hour of a
// day. It is NOT a measured prediction of bites. It combines three things that
// anglers widely agree on — moving water, low light (dawn / dusk) and a
// workable sea — plus a small per-species preference, and (once the user has
// enough catches of that species) the user's own tide-phase history.

import { sunTimes } from "./astro";
import type { Pt } from "./marine/tide";
import { minutesToNearestTurn, tideState, type TurnEvent } from "./marine/waqfa";

const MIN = 60_000;
const H = 3_600_000;

export interface Profile {
  /** extra weight (0..1) when the tide is rising (سجي) / falling (ثبر) */
  rising: number;
  falling: number;
  /** 0..1: how much this fish bites at slack water (وقفة الماء). 0 = prefers moving water. */
  slack: number;
  /** hours either side of every high / low tide that count as the fishing band (0 = off). A tested rule for grouper. */
  turnBand: number;
  /** also a fishing window around sunset (told by the user for balool) */
  duskWindow?: boolean;
  /** how good each light period is for this species (0..1) */
  dawn: number;
  dusk: number;
  night: number;
  day: number;
}

/**
 * General rule (told by the user — sobaity, shaam, nuwaibi and most fish): active within
 * 2 h before and 2 h after the slack, strongest at the start of the run after the slack
 * (رشة الماء), active in the falling tide (ثبر), and keen at sunrise.
 */
const BASE: Profile = { rising: 0.6, falling: 0.8, slack: 0, turnBand: 2, dawn: 1, dusk: 0.7, night: 0.3, day: 0.15 };

/** Fish whose peak is the slack itself rather than the start of the run. */
export const PROFILES: Record<string, Partial<Profile>> = {
  // Told by the user (a tested rule): hamour / balool bite 2 h before and after every high and low tide, strongest at the slack.
  // Balool is also active at sunset (told by the user).
  بالول: { slack: 1, duskWindow: true, rising: 0.3, falling: 0.3, dusk: 1, dawn: 0.6, night: 0.4, day: 0.15 },
  هامور: { slack: 1, rising: 0.3, falling: 0.3, dusk: 1, dawn: 0.8, night: 0.5, day: 0.2 },
};

/** The fish shown as quick chips, in order. */
export const MAIN_SPECIES = ["شعم", "سبيطي", "بالول", "هامور", "نويبي", "شعري", "كنعد", "جيذر", "جش"];

export function profileFor(nameAr: string | null | undefined): Profile {
  return { ...BASE, ...(nameAr ? PROFILES[nameAr] : undefined) };
}

export interface Cond {
  windKmh?: number | null;
  waveM?: number | null;
}

export type Why = "moving" | "rising" | "falling" | "slack" | "dawn" | "dusk" | "night" | "rough";

export interface Slot {
  t: number;
  score: number;
  move: number;
  slack: number;
  light: number;
  cond: number;
  /** minutes to the nearest high/low tide (negative = before it) */
  turnMin: number | null;
  dir: "rising" | "falling" | "waqfa" | null;
  rateCm: number | null;
}

export interface BestWindow {
  from: number;
  to: number;
  /** the strongest part of a turn-band window: the slack itself, or the start of the run after it */
  peak?: { from: number; to: number; kind: "slack" | "start" };
  /** set for turn-band windows: the high/low tide this window is built around */
  turn?: { t: number; type: "high" | "low"; slack: boolean };
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
    // how close to standing still: 1 inside the waqfa window, fading out to 12 cm/h
    const slack = rate == null ? 0 : dir === "waqfa" ? 1 : clamp01(1 - Math.abs(rate) / 12);
    // tide part: moving-water fish like `move`; slack-water fish (balool, hamour) like the standstill most
    const near = opts.turns.length ? minutesToNearestTurn(opts.turns, mid) : null;
    const band = opts.profile.turnBand * 60;
    let tideF: number;
    if (band > 0 && near) {
      // tested rule: ±band hours around every high / low tide, strongest within 30 min of the turn (the slack)
      const d = Math.abs(near.minutes);
      if (opts.profile.slack > 0) {
        tideF = d <= 30 ? 1 : d <= band ? 1 - (0.35 * (d - 30)) / (band - 30) : Math.max(0.15, 0.65 - (0.5 * (d - band)) / 60);
      } else {
        // general fish: best in the first 90 min after the slack (the run starts), a bit lower in the 2 h before it
        const m = near.minutes; // positive = after the turn
        if (m >= 0 && m <= 90) tideF = 1;
        else if (m > 90 && m <= band) tideF = 1 - (0.35 * (m - 90)) / Math.max(1, band - 90);
        else if (m < 0 && m >= -band) tideF = 0.65 + (0.3 * (band + m)) / band;
        else tideF = Math.max(0.15, 0.65 - (0.5 * (d - band)) / 60);
      }
    } else {
      tideF = opts.profile.slack > 0 ? Math.max(move * (1 - 0.4 * opts.profile.slack), opts.profile.slack * slack) : move;
    }
    const l = lightFactor(mid, sunrise, sunset, opts.profile);
    const cond = condFactor(opts.cond(mid));
    const dirF = dir === "rising" ? opts.profile.rising : dir === "falling" ? opts.profile.falling : 0;
    const dirPart = opts.profile.slack > 0 && dir === "waqfa" ? 1 : dirF;
    let raw = band > 0 ? (opts.profile.slack > 0 ? (opts.profile.duskWindow ? 0.7 * tideF + 0.3 * l.value : 0.8 * tideF + 0.2 * l.value) : 0.65 * tideF + 0.2 * l.value + 0.15 * dirF) : 0.5 * tideF + 0.35 * l.value + 0.15 * dirPart;
    if (usePersonal && dir) {
      const n = opts.personal!.n;
      const share = (dir === "rising" ? opts.personal!.rising : dir === "falling" ? opts.personal!.falling : opts.personal!.waqfa) / n;
      raw *= 0.85 + 0.6 * share; // 25 % share = neutral
    }
    slots.push({ t, score: Math.round(100 * clamp01(raw) * cond), move, slack, light: l.value, cond, turnMin: near ? near.minutes : null, dir, rateCm: rate });
    kinds.push(l.kind);
  }

  if (opts.profile.turnBand > 0 && opts.turns.length) {
    const bandMs = opts.profile.turnBand * H;
    const dayEnd = opts.dayStart + 24 * H;
    const bandWindows: BestWindow[] = opts.turns
      .filter((x) => x.t + bandMs > opts.dayStart && x.t - bandMs < dayEnd)
      .map((x) => {
        const from = Math.max(opts.dayStart, x.t - bandMs);
        const to = Math.min(dayEnd, x.t + bandMs);
        const part = slots.filter((s) => s.t + step / 2 >= from && s.t + step / 2 < to);
        const best = part.length ? Math.max(...part.map((s) => s.score)) : 0;
        const why: Why[] = [];
        if (sunrise != null && sunrise >= from - 15 * MIN && sunrise <= to + 15 * MIN) why.push("dawn");
        if (sunset != null && (opts.profile.duskWindow ? from < sunset + 60 * MIN && to > sunset - 60 * MIN : sunset >= from - 15 * MIN && sunset <= to + 15 * MIN)) why.push("dusk");
        if (part.length && part.reduce((a, s) => a + s.cond, 0) / part.length < 0.8) why.push("rough");
        const peak = opts.profile.slack > 0 ? { from: x.t - 30 * MIN, to: x.t + 30 * MIN, kind: "slack" as const } : { from: x.t, to: x.t + 90 * MIN, kind: "start" as const };
        return { from, to, score: best, rating: best >= 70 ? ("excellent" as const) : best >= 50 ? ("good" as const) : ("fair" as const), why, peak, turn: { t: x.t, type: x.type, slack: x.waqfaStart != null } };
      })
      .sort((a, b) => a.from - b.from);
    // balool: sunset is a fishing time of its own — add a window when no tide window already covers it
    if (opts.profile.duskWindow && sunset != null) {
      const from = Math.max(opts.dayStart, sunset - 60 * MIN);
      const to = Math.min(dayEnd, sunset + 60 * MIN);
      if (to > from && !bandWindows.some((w) => w.from < to && w.to > from)) {
        const part = slots.filter((s) => s.t + step / 2 >= from && s.t + step / 2 < to);
        const best = part.length ? Math.max(...part.map((s) => s.score)) : 0;
        bandWindows.push({ from, to, score: best, rating: best >= 70 ? "excellent" : best >= 50 ? "good" : "fair", why: ["dusk"] });
        bandWindows.sort((a, b) => a.from - b.from);
      }
    }
    return { slots, windows: bandWindows, sunrise, sunset };
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
      if (opts.profile.slack > 0 && part.filter((s) => s.dir === "waqfa").length >= Math.max(1, part.length / 3)) why.push("slack");
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
