// Client-side validation. The same limits are enforced again by CHECK
// constraints in the database, so invalid data can't sneak in either way.
import type { Catch, Trip } from "./types";

type Errors = Record<string, string>;

function range<T>(e: Errors, obj: T, k: keyof T & string, lo: number, hi: number) {
  const v = obj[k] as unknown as number | null;
  if (v != null && (typeof v !== "number" || isNaN(v) || v < lo || v > hi)) e[k] = "range";
}

export function validateTrip(t: Trip): Errors {
  const e: Errors = {};
  if (!t.started_at) e.started_at = "required";
  if (t.ended_at && t.started_at && t.ended_at < t.started_at) e.ended_at = "before_start";
  else if (t.ended_at && t.started_at && new Date(t.ended_at).getTime() - new Date(t.started_at).getTime() > 72 * 3600_000)
    e.ended_at = "too_long";
  range(e, t, "wind_speed_kmh", 0, 299);
  range(e, t, "water_depth_m", 0, 10999);
  range(e, t, "air_temp_c", -20, 65);
  range(e, t, "line_pe", 0.1, 20);
  if (t.title && t.title.length > 120) e.title = "long";
  if (t.notes && t.notes.length > 5000) e.notes = "long";
  return e;
}

export function validateCatch(c: Catch, trip?: Trip): Errors {
  const e: Errors = {};
  if (!c.caught_at) e.caught_at = "required";
  range(e, c, "weight_kg", 0.001, 999);
  range(e, c, "length_cm", 0.1, 999);
  range(e, c, "depth_m", 0, 10999);
  range(e, c, "pe_rating", 0.1, 20);
  if (c.notes && c.notes.length > 5000) e.notes = "long";
  // Soft sanity check: catch time should be within (or near) the trip.
  if (trip && c.caught_at) {
    const t = new Date(c.caught_at).getTime();
    const s = new Date(trip.started_at).getTime() - 6 * 3600_000;
    const end = trip.ended_at ? new Date(trip.ended_at).getTime() + 6 * 3600_000 : Infinity;
    if (t < s || t > end) e.caught_at = "outside_trip";
  }
  return e;
}
