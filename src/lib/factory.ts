import { uuid } from "./ids";
import type { Catch, Dataset, Trip } from "./types";

const ts = () => new Date().toISOString();

/** Most recently used values, so a new trip on the boat needs ~zero typing. */
/** Catch fields prefilled from the trip's plan (all editable). */
export function prefillFromTrip(trip: Trip | null): Partial<Catch> {
  if (!trip) return {};
  return {
    location_id: trip.location_id,
    technique_id: trip.technique_id,
    depth_m: trip.target_depth_m ?? null,
    lure_bait: trip.lure_type ?? trip.lure_bait ?? null,
    lure_weight_g: trip.lure_weight_g ?? null,
    lure_color: trip.lure_color ?? null,
    pe_rating: trip.line_pe ?? null,
  };
}

export function lastUsed(ds: Dataset) {
  const last = [...ds.trips].sort((a, b) => b.started_at.localeCompare(a.started_at))[0];
  return {
    location_id: last?.location_id ?? null,
    technique_id: last?.technique_id ?? null,
    target_species_id: last?.target_species_id ?? null,
    line_pe: last?.line_pe ?? null,
  };
}

export function newTrip(partial: Partial<Trip> = {}): Trip {
  const now = ts();
  return {
    id: uuid(),
    title: null,
    status: "draft",
    started_at: now,
    ended_at: null,
    hijri_date_override: null,
    location_id: null,
    lat: null,
    lng: null,
    technique_id: null,
    target_species_id: null,
    weather: null,
    air_temp_c: null,
    wind_speed_kmh: null,
    wind_dir: null,
    sea_state: null,
    water_depth_m: null,
    tide: null,
    moon_phase: null,
    line_pe: null,
    lure_bait: null,
    gear_notes: null,
    notes: null,
    is_demo: false,
    created_at: now,
    updated_at: now,
    ...partial,
  };
}

export function newCatch(trip: Trip | null, partial: Partial<Catch> = {}): Catch {
  const now = ts();
  // A catch logged for a past trip defaults to the trip start, not "now".
  const tripEnded = trip?.ended_at && new Date(trip.ended_at).getTime() < Date.now();
  const caught_at = trip && (tripEnded || new Date(trip.started_at).getTime() > Date.now()) ? trip.started_at : now;
  return {
    id: uuid(),
    trip_id: trip?.id ?? null,
    species_id: null,
    caught_at,
    weight_kg: null,
    weight_is_estimate: false,
    length_cm: null,
    length_is_estimate: false,
    location_id: null,
    depth_m: null,
    technique_id: null,
    line_type: null,
    pe_rating: null,
    lure_bait: null,
    weather: null,
    tide: null,
    moon_phase: null,
    notes: null,
    released: false,
    photo_media_id: null,
    identification_status: "manual",
    ai_species_id: null,
    ai_suggestion: null,
    is_demo: false,
    created_at: now,
    updated_at: now,
    ...partial,
  };
}
