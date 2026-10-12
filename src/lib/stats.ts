// Analytics over the user's own records. Pure functions, no I/O.
//
// Rules implemented here (from the product brief):
// * Trip success = at least one catch. Unsuccessful trips are always included.
// * Catch count and trip success rate are reported separately.
// * Every rate carries its sample size; groups below MIN_SAMPLE trips are
//   flagged as insufficient so the UI never presents them as conclusions.
// * Tide / weather are only ever taken from what the user recorded.
//   Missing values are reported as "not recorded", never guessed.
// * Moon phase may fall back to the astronomically calculated phase
//   (deterministic, not a guess) and is flagged as calculated.

import { effectiveMoonPhase } from "./astro";
import { tripHijri } from "./hijri";
import { dateKey, kwParts, monthKey, tripHours, addDays, todayKey, dateKeyToDate } from "./time";
import type { Catch, Dataset, Location, MoonPhase, Species, Technique, Tide, Trip } from "./types";

export const MIN_SAMPLE = 5;

export interface Filters {
  from?: string; // YYYY-MM-DD (Kuwait)
  to?: string;
  speciesId?: string;
  techniqueId?: string;
  locationId?: string;
  tide?: Tide;
  moon?: MoonPhase;
  hijriMonth?: number; // 1..12
  hijriYear?: number;
  q?: string;
}

export interface TripRow {
  trip: Trip;
  /** Catches of this trip that match the species filter. */
  catches: Catch[];
  allCatches: Catch[];
  success: boolean;
  hours: number | null;
  day: string; // Kuwait date key
  moon: { phase: MoonPhase; calculated: boolean };
}

export interface Index {
  speciesById: Map<string, Species>;
  techById: Map<string, Technique>;
  techByCode: Map<string, Technique>;
  locById: Map<string, Location>;
  tripById: Map<string, Trip>;
  catchesByTrip: Map<string, Catch[]>;
}

export function buildIndex(ds: Dataset): Index {
  const catchesByTrip = new Map<string, Catch[]>();
  for (const c of ds.catches) {
    const arr = catchesByTrip.get(c.trip_id);
    if (arr) arr.push(c);
    else catchesByTrip.set(c.trip_id, [c]);
  }
  for (const arr of catchesByTrip.values()) arr.sort((a, b) => a.caught_at.localeCompare(b.caught_at));
  return {
    speciesById: new Map(ds.species.map((s) => [s.id, s])),
    techById: new Map(ds.techniques.map((t) => [t.id, t])),
    techByCode: new Map(ds.techniques.map((t) => [t.code, t])),
    locById: new Map(ds.locations.map((l) => [l.id, l])),
    tripById: new Map(ds.trips.map((t) => [t.id, t])),
    catchesByTrip,
  };
}

/** Technique / location of a catch: its own value, else the trip's. */
export function catchTechnique(c: Catch, idx: Index): string | null {
  return c.technique_id ?? idx.tripById.get(c.trip_id)?.technique_id ?? null;
}
export function catchLocation(c: Catch, idx: Index): string | null {
  return c.location_id ?? idx.tripById.get(c.trip_id)?.location_id ?? null;
}
export function catchDepth(c: Catch, idx: Index): { depth: number; fromTrip: boolean } | null {
  if (c.depth_m != null) return { depth: c.depth_m, fromTrip: false };
  const t = idx.tripById.get(c.trip_id)?.water_depth_m;
  return t != null ? { depth: t, fromTrip: true } : null;
}

export function tripRows(ds: Dataset, idx: Index, f: Filters = {}, hijriOffset = 0, includeDrafts = false): TripRow[] {
  const rows: TripRow[] = [];
  for (const trip of ds.trips) {
    if (!includeDrafts && trip.status === "draft") continue;
    const day = dateKey(trip.started_at);
    if (f.from && day < f.from) continue;
    if (f.to && day > f.to) continue;
    if (f.techniqueId && trip.technique_id !== f.techniqueId) continue;
    if (f.locationId && trip.location_id !== f.locationId) continue;
    if (f.tide && trip.tide !== f.tide) continue;
    const moon = effectiveMoonPhase(trip);
    if (f.moon && moon.phase !== f.moon) continue;
    if (f.hijriMonth || f.hijriYear) {
      const h = tripHijri(trip, hijriOffset).date;
      if (f.hijriMonth && h.month !== f.hijriMonth) continue;
      if (f.hijriYear && h.year !== f.hijriYear) continue;
    }
    const allCatches = idx.catchesByTrip.get(trip.id) ?? [];
    const catches = f.speciesId ? allCatches.filter((c) => c.species_id === f.speciesId) : allCatches;
    rows.push({ trip, catches, allCatches, success: catches.length > 0, hours: tripHours(trip), day, moon });
  }
  rows.sort((a, b) => a.trip.started_at.localeCompare(b.trip.started_at));
  return rows;
}

export interface Summary {
  trips: number;
  successful: number;
  blank: number;
  successRate: number | null; // 0..1
  catches: number;
  catchesPerTrip: number | null;
  hours: number;
  tripsWithHours: number;
  catchesPerHour: number | null;
  speciesCount: number;
}

export function summarize(rows: TripRow[]): Summary {
  let successful = 0;
  let catches = 0;
  let hours = 0;
  let tripsWithHours = 0;
  let catchesInTimedTrips = 0;
  const species = new Set<string>();
  for (const r of rows) {
    if (r.success) successful++;
    catches += r.catches.length;
    for (const c of r.catches) if (c.species_id) species.add(c.species_id);
    if (r.hours != null) {
      hours += r.hours;
      tripsWithHours++;
      catchesInTimedTrips += r.catches.length;
    }
  }
  const trips = rows.length;
  return {
    trips,
    successful,
    blank: trips - successful,
    successRate: trips ? successful / trips : null,
    catches,
    catchesPerTrip: trips ? catches / trips : null,
    hours,
    tripsWithHours,
    // Only trips with a known duration contribute to the per-hour rate.
    catchesPerHour: hours > 0 ? catchesInTimedTrips / hours : null,
    speciesCount: species.size,
  };
}

export interface GroupStat extends Summary {
  key: string;
  sufficient: boolean;
}

export function groupRows(rows: TripRow[], keyOf: (r: TripRow) => string | null): { groups: GroupStat[]; missing: number } {
  const map = new Map<string, TripRow[]>();
  let missing = 0;
  for (const r of rows) {
    const k = keyOf(r);
    if (k == null) {
      missing++;
      continue;
    }
    const arr = map.get(k);
    if (arr) arr.push(r);
    else map.set(k, [r]);
  }
  const groups = [...map.entries()].map(([key, rs]) => {
    const s = summarize(rs);
    return { key, ...s, sufficient: s.trips >= MIN_SAMPLE };
  });
  return { groups, missing };
}

export const byTechnique = (rows: TripRow[]) => groupRows(rows, (r) => r.trip.technique_id);
export const byLocation = (rows: TripRow[]) => groupRows(rows, (r) => r.trip.location_id);
export const byTide = (rows: TripRow[]) => groupRows(rows, (r) => r.trip.tide);
export const bySeaState = (rows: TripRow[]) => groupRows(rows, (r) => r.trip.sea_state);
export const byMoon = (rows: TripRow[]) => groupRows(rows, (r) => r.moon.phase);
export const byWeekday = (rows: TripRow[]) => groupRows(rows, (r) => String(kwParts(r.trip.started_at).weekday));
export const byMonthOfYear = (rows: TripRow[]) => groupRows(rows, (r) => String(kwParts(r.trip.started_at).month));
export const byMonthKey = (rows: TripRow[]) => groupRows(rows, (r) => monthKey(r.trip.started_at));

export interface HourStat {
  hour: number;
  catches: number;
  exposureHours: number; // total hours spent fishing during this clock hour
  rate: number | null; // catches per fishing hour (timed trips only)
}

/** Catches by clock hour, normalised by how many hours were actually spent fishing in that hour. */
export function byHour(rows: TripRow[]): HourStat[] {
  const catches = new Array(24).fill(0);
  const timedCatches = new Array(24).fill(0);
  const exposure = new Array(24).fill(0);
  for (const r of rows) {
    for (const c of r.catches) {
      const h = kwParts(c.caught_at).hour;
      catches[h]++;
      if (r.hours != null) timedCatches[h]++;
    }
    if (r.hours != null && r.trip.ended_at) {
      // Walk the trip in 15-minute steps and add exposure per clock hour.
      const start = new Date(r.trip.started_at).getTime();
      const end = new Date(r.trip.ended_at).getTime();
      for (let t = start; t < end; t += 15 * 60_000) {
        const step = Math.min(15 * 60_000, end - t) / 3_600_000;
        exposure[kwParts(new Date(t)).hour] += step;
      }
    }
  }
  return catches.map((n, hour) => ({
    hour,
    catches: n,
    exposureHours: exposure[hour],
    rate: exposure[hour] >= 0.5 ? timedCatches[hour] / exposure[hour] : null,
  }));
}

export function speciesCounts(catches: Catch[]): { speciesId: string | null; count: number }[] {
  const m = new Map<string | null, number>();
  for (const c of catches) m.set(c.species_id, (m.get(c.species_id) ?? 0) + 1);
  return [...m.entries()].map(([speciesId, count]) => ({ speciesId, count })).sort((a, b) => b.count - a.count);
}

export interface DepthStat {
  speciesId: string;
  n: number;
  min: number;
  max: number;
  median: number;
  fromTrip: number; // how many values came from the trip-level depth
}

export function depthBySpecies(catches: Catch[], idx: Index): DepthStat[] {
  const m = new Map<string, { v: number[]; fromTrip: number }>();
  for (const c of catches) {
    if (!c.species_id) continue;
    const d = catchDepth(c, idx);
    if (!d) continue;
    const e = m.get(c.species_id) ?? { v: [], fromTrip: 0 };
    e.v.push(d.depth);
    if (d.fromTrip) e.fromTrip++;
    m.set(c.species_id, e);
  }
  return [...m.entries()]
    .map(([speciesId, { v, fromTrip }]) => {
      v.sort((a, b) => a - b);
      const mid = Math.floor(v.length / 2);
      return {
        speciesId,
        n: v.length,
        min: v[0],
        max: v[v.length - 1],
        median: v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2,
        fromTrip,
      };
    })
    .sort((a, b) => b.n - a.n);
}

// ---------------------------------------------------------------------------
// Personal records
// ---------------------------------------------------------------------------
export interface Records {
  heaviest: { measured: Catch | null; estimated: Catch | null };
  longest: { measured: Catch | null; estimated: Catch | null };
  mostFishTrip: { row: TripRow; count: number } | null;
  mostSpeciesTrip: { row: TripRow; count: number } | null;
  bestMonth: { month: string; catches: number; trips: number; successful: number } | null;
  bestSpot: { locationId: string; stat: GroupStat; basis: "rate" | "total" } | null;
  bestTechnique: { techniqueId: string; stat: GroupStat; basis: "rate" | "total" } | null;
  topSpecies: { speciesId: string; count: number } | null;
  longestSuccessStreak: { length: number; from: Trip; to: Trip } | null;
}

function maxBy<T>(items: T[], f: (x: T) => number | null): T | null {
  let best: T | null = null;
  let bv = -Infinity;
  for (const x of items) {
    const v = f(x);
    if (v != null && v > bv) {
      bv = v;
      best = x;
    }
  }
  return best;
}

const RECORD_MIN_TRIPS = 3;

export function records(rows: TripRow[], catches: Catch[]): Records {
  const heaviestMeasured = maxBy(catches, (c) => (c.weight_kg != null && !c.weight_is_estimate ? c.weight_kg : null));
  const heaviestEst = maxBy(catches, (c) => (c.weight_kg != null && c.weight_is_estimate ? c.weight_kg : null));
  const longestMeasured = maxBy(catches, (c) => (c.length_cm != null && !c.length_is_estimate ? c.length_cm : null));
  const longestEst = maxBy(catches, (c) => (c.length_cm != null && c.length_is_estimate ? c.length_cm : null));

  const mostFish = maxBy(rows, (r) => (r.catches.length ? r.catches.length : null));
  const distinct = (r: TripRow) => new Set(r.catches.map((c) => c.species_id).filter(Boolean)).size;
  const mostSpecies = maxBy(rows, (r) => (distinct(r) ? distinct(r) : null));

  const months = byMonthKey(rows).groups;
  const bestMonthG = maxBy(months, (g) => (g.catches ? g.catches + (g.successRate ?? 0) / 10 : null));

  const pickBest = (groups: GroupStat[], score: (g: GroupStat) => number | null) => {
    const eligible = groups.filter((g) => g.trips >= RECORD_MIN_TRIPS);
    if (eligible.length) {
      const g = maxBy(eligible, score);
      return g ? { g, basis: "rate" as const } : null;
    }
    const g = maxBy(groups, (x) => (x.catches ? x.catches : null));
    return g ? { g, basis: "total" as const } : null;
  };
  const spot = pickBest(byLocation(rows).groups, (g) => g.catchesPerTrip);
  const tech = pickBest(byTechnique(rows).groups, (g) =>
    g.successRate == null ? null : g.successRate + (g.catchesPerTrip ?? 0) / 1000,
  );

  const top = speciesCounts(catches).find((s) => s.speciesId);

  // Longest run of consecutive successful trips (chronological).
  let streak: Records["longestSuccessStreak"] = null;
  let runStart = -1;
  for (let i = 0; i <= rows.length; i++) {
    if (i < rows.length && rows[i].success) {
      if (runStart < 0) runStart = i;
    } else if (runStart >= 0) {
      const len = i - runStart;
      if (!streak || len > streak.length) streak = { length: len, from: rows[runStart].trip, to: rows[i - 1].trip };
      runStart = -1;
    }
  }

  return {
    heaviest: { measured: heaviestMeasured, estimated: heaviestEst },
    longest: { measured: longestMeasured, estimated: longestEst },
    mostFishTrip: mostFish ? { row: mostFish, count: mostFish.catches.length } : null,
    mostSpeciesTrip: mostSpecies ? { row: mostSpecies, count: distinct(mostSpecies) } : null,
    bestMonth: bestMonthG
      ? { month: bestMonthG.key, catches: bestMonthG.catches, trips: bestMonthG.trips, successful: bestMonthG.successful }
      : null,
    bestSpot: spot ? { locationId: spot.g.key, stat: spot.g, basis: spot.basis } : null,
    bestTechnique: tech ? { techniqueId: tech.g.key, stat: tech.g, basis: tech.basis } : null,
    topSpecies: top && top.speciesId ? { speciesId: top.speciesId, count: top.count } : null,
    longestSuccessStreak: streak && streak.length >= 2 ? streak : null,
  };
}

// ---------------------------------------------------------------------------
// Streaks (going fishing — not catching — so blank days are never punished)
// ---------------------------------------------------------------------------
/** Start (Sunday) of the Kuwait week containing a date key. */
export function weekStart(key: string): string {
  const wd = dateKeyToDate(key).getUTCDay();
  return addDays(key, -wd);
}

/** Consecutive weeks (Sun–Sat) with at least one trip, ending this week or last week. */
export function weeklyTripStreak(trips: Trip[], today = todayKey()): number {
  const weeks = new Set(trips.filter((t) => t.status === "completed").map((t) => weekStart(dateKey(t.started_at))));
  let w = weekStart(today);
  if (!weeks.has(w)) w = addDays(w, -7);
  let n = 0;
  while (weeks.has(w)) {
    n++;
    w = addDays(w, -7);
  }
  return n;
}

// ---------------------------------------------------------------------------
// Species collection
// ---------------------------------------------------------------------------
export interface SpeciesStats {
  species: Species;
  catches: Catch[]; // chronological
  count: number;
  first: Catch | null;
  last: Catch | null;
  heaviest: Catch | null; // measured preferred
  longest: Catch | null;
  avgWeight: { value: number; n: number } | null; // measured values only
  avgLength: { value: number; n: number } | null;
  locations: { locationId: string; count: number }[];
  techniques: { techniqueId: string; count: number }[];
  hours: { hour: number; count: number }[];
  bestPhotoMediaId: string | null;
  kept: number;
  released: number;
}

function countBy<T>(items: T[], key: (x: T) => string | null): { key: string; count: number }[] {
  const m = new Map<string, number>();
  for (const x of items) {
    const k = key(x);
    if (k) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
}

export function speciesStats(sp: Species, ds: Dataset, idx: Index): SpeciesStats {
  const catches = ds.catches.filter((c) => c.species_id === sp.id).sort((a, b) => a.caught_at.localeCompare(b.caught_at));
  const measuredW = catches.filter((c) => c.weight_kg != null && !c.weight_is_estimate);
  const measuredL = catches.filter((c) => c.length_cm != null && !c.length_is_estimate);
  const heaviest =
    maxBy(measuredW, (c) => c.weight_kg) ?? maxBy(catches, (c) => c.weight_kg);
  const longest = maxBy(measuredL, (c) => c.length_cm) ?? maxBy(catches, (c) => c.length_cm);
  const avg = (arr: Catch[], f: (c: Catch) => number) =>
    arr.length ? { value: arr.reduce((s, c) => s + f(c), 0) / arr.length, n: arr.length } : null;
  const withPhoto = catches.filter((c) => c.photo_media_id);
  const bestPhoto =
    maxBy(withPhoto, (c) => c.weight_kg ?? c.length_cm ?? null)?.photo_media_id ??
    withPhoto[withPhoto.length - 1]?.photo_media_id ??
    sp.cover_media_id;
  return {
    species: sp,
    catches,
    count: catches.length,
    first: catches[0] ?? null,
    last: catches[catches.length - 1] ?? null,
    heaviest,
    longest,
    avgWeight: avg(measuredW, (c) => c.weight_kg!),
    avgLength: avg(measuredL, (c) => c.length_cm!),
    locations: countBy(catches, (c) => catchLocation(c, idx)).map((x) => ({ locationId: x.key, count: x.count })),
    techniques: countBy(catches, (c) => catchTechnique(c, idx)).map((x) => ({ techniqueId: x.key, count: x.count })),
    hours: countBy(catches, (c) => String(kwParts(c.caught_at).hour)).map((x) => ({ hour: Number(x.key), count: x.count })),
    bestPhotoMediaId: bestPhoto ?? null,
    kept: catches.filter((c) => !c.released).length,
    released: catches.filter((c) => c.released).length,
  };
}

/** First-ever catch date per species (for "new species" detection). */
export function firstCatchBySpecies(catches: Catch[]): Map<string, Catch> {
  const m = new Map<string, Catch>();
  for (const c of [...catches].sort((a, b) => a.caught_at.localeCompare(b.caught_at))) {
    if (c.species_id && !m.has(c.species_id)) m.set(c.species_id, c);
  }
  return m;
}

export function pct(x: number | null | undefined): string {
  if (x == null) return "—";
  return `${Math.round(x * 100)}%`;
}
