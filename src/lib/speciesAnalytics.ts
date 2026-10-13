// Species-specific analytics.
//
// Denominator: completed trips where the user explicitly set this species as
// the TARGET. A target trip "succeeds" when at least one fish of the species
// was caught on it. Trips targeting other species are never counted as failed
// trips for this species. Catches of the species made on non-target trips are
// reported separately and do not enter the rates.

import { effectiveMoonPhase } from "./astro";
import { tripEnv } from "./marine/env";
import { MIN_SAMPLE, type Index } from "./stats";
import { kwParts } from "./time";
import { targetsOf } from "./trips";
import type { Dataset, Trip } from "./types";
import { FT_PER_M, readDepthUnit, type DepthUnit } from "./depth";

export interface RateGroup {
  key: string;
  trips: number; // denominator
  successful: number;
  rate: number | null;
  fish: number;
  sufficient: boolean;
}
export interface Breakdown {
  groups: RateGroup[];
  missing: number; // target trips without a value for this dimension
}

export const TIME_BUCKETS = ["night", "dawn", "morning", "midday", "afternoon", "evening"] as const;
export type TimeBucket = (typeof TIME_BUCKETS)[number];
export function timeBucket(hour: number): TimeBucket {
  if (hour < 4) return "night";
  if (hour < 7) return "dawn";
  if (hour < 11) return "morning";
  if (hour < 15) return "midday";
  if (hour < 18) return "afternoon";
  return "evening";
}

export const DEPTH_BUCKETS = ["0-5", "5-10", "10-20", "20-30", "30+"] as const;
export const DEPTH_BUCKETS_FT = ["0-15", "15-30", "30-60", "60-100", "100+"] as const;
export const depthBuckets = (unit: DepthUnit): readonly string[] => (unit === "ft" ? DEPTH_BUCKETS_FT : DEPTH_BUCKETS);
/** `d` is in metres; buckets are in the chosen display unit. */
export function depthBucket(d: number, unit: DepthUnit = readDepthUnit()): string {
  if (unit === "ft") {
    const f = d * FT_PER_M;
    if (f < 15) return "0-15";
    if (f < 30) return "15-30";
    if (f < 60) return "30-60";
    if (f < 100) return "60-100";
    return "100+";
  }
  if (d < 5) return "0-5";
  if (d < 10) return "5-10";
  if (d < 20) return "10-20";
  if (d < 30) return "20-30";
  return "30+";
}

export const WIND_BUCKETS_KN = ["0-5", "5-10", "10-15", "15-20", "20+"] as const;
export function windBucketKn(kmh: number): (typeof WIND_BUCKETS_KN)[number] {
  const kn = kmh / 1.852;
  if (kn < 5) return "0-5";
  if (kn < 10) return "5-10";
  if (kn < 15) return "10-15";
  if (kn < 20) return "15-20";
  return "20+";
}
export const WAVE_BUCKETS = ["<0.25", "0.25-0.5", "0.5-1", "1+"] as const;
export function waveBucket(m: number): (typeof WAVE_BUCKETS)[number] {
  if (m < 0.25) return "<0.25";
  if (m < 0.5) return "0.25-0.5";
  if (m < 1) return "0.5-1";
  return "1+";
}

interface TT {
  trip: Trip;
  fish: number;
}

function breakdown(items: TT[], keyOf: (t: TT) => string | null): Breakdown {
  const m = new Map<string, TT[]>();
  let missing = 0;
  for (const it of items) {
    const k = keyOf(it);
    if (k == null) {
      missing++;
      continue;
    }
    m.set(k, [...(m.get(k) ?? []), it]);
  }
  const groups = [...m.entries()].map(([key, list]) => {
    const successful = list.filter((x) => x.fish > 0).length;
    return {
      key,
      trips: list.length,
      successful,
      rate: list.length ? successful / list.length : null,
      fish: list.reduce((s, x) => s + x.fish, 0),
      sufficient: list.length >= MIN_SAMPLE,
    };
  });
  return { groups: groups.sort((a, b) => b.trips - a.trips), missing };
}

export interface SpeciesTargetAnalytics {
  targetTrips: number;
  successful: number;
  unsuccessful: number;
  rate: number | null;
  fishOnTargetTrips: number;
  fishOnOtherTrips: number;
  byTechnique: Breakdown;
  byTimeOfDay: Breakdown;
  byTide: Breakdown;
  byMoon: Breakdown;
  byDepth: Breakdown;
  bySpot: Breakdown;
  byWind: Breakdown;
  byWave: Breakdown;
}

export function speciesTargetAnalytics(ds: Dataset, idx: Index, speciesId: string, filter?: (t: Trip) => boolean): SpeciesTargetAnalytics {
  const targets: TT[] = ds.trips
    .filter((t) => t.status === "completed" && targetsOf(ds, t).includes(speciesId) && (!filter || filter(t)))
    .map((trip) => ({ trip, fish: (idx.catchesByTrip.get(trip.id) ?? []).filter((c) => c.species_id === speciesId).length }));
  const targetIds = new Set(targets.map((t) => t.trip.id));
  const allOfSpecies = ds.catches.filter((c) => c.species_id === speciesId);
  const successful = targets.filter((t) => t.fish > 0).length;
  const env = new Map(targets.map((t) => [t.trip.id, tripEnv(ds, t.trip)]));

  return {
    targetTrips: targets.length,
    successful,
    unsuccessful: targets.length - successful,
    rate: targets.length ? successful / targets.length : null,
    fishOnTargetTrips: allOfSpecies.filter((c) => targetIds.has(c.trip_id ?? "")).length,
    fishOnOtherTrips: allOfSpecies.filter((c) => !targetIds.has(c.trip_id ?? "")).length,
    byTechnique: breakdown(targets, (t) => t.trip.technique_id),
    byTimeOfDay: breakdown(targets, (t) => timeBucket(kwParts(t.trip.started_at).hour)),
    byTide: breakdown(targets, (t) => env.get(t.trip.id)?.tidePhase?.value ?? null),
    byMoon: breakdown(targets, (t) => effectiveMoonPhase(t.trip).phase),
    byDepth: breakdown(targets, (t) => (t.trip.water_depth_m != null ? depthBucket(t.trip.water_depth_m) : null)),
    bySpot: breakdown(targets, (t) => t.trip.location_id),
    byWind: breakdown(targets, (t) => {
      const w = env.get(t.trip.id)?.wind;
      return w ? windBucketKn(w.value) : null;
    }),
    byWave: breakdown(targets, (t) => {
      const w = env.get(t.trip.id)?.wave;
      return w ? waveBucket(w.value) : null;
    }),
  };
}
