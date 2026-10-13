// Trip lifecycle and target species.
//   planned → active → completed        (cancelled: a planned trip that didn't happen)
// "draft" is a legacy name for active. Only completed trips enter statistics;
// a completed trip with zero catches is a valid (unsuccessful) record.

import type { useStore } from "./db/store";
import { coordsForTrip, takeSnapshot } from "./marine/snapshots";
import type { Dataset, Trip } from "./types";
import { isActiveStatus } from "./types";

type Store = ReturnType<typeof useStore>;

/** All target species of a trip (join table plus the legacy single column). */
export function targetsOf(ds: Pick<Dataset, "trip_targets">, trip: Trip): string[] {
  const ids = ds.trip_targets.filter((x) => x.trip_id === trip.id).map((x) => x.species_id);
  if (trip.target_species_id && !ids.includes(trip.target_species_id)) ids.unshift(trip.target_species_id);
  return ids;
}

export async function setTargets(store: Pick<Store, "ds" | "save" | "remove">, trip: Trip, speciesIds: string[]) {
  const before = store.ds.trip_targets.filter((x) => x.trip_id === trip.id);
  const rm = before.filter((x) => !speciesIds.includes(x.species_id));
  const add = speciesIds.filter((s) => !before.some((x) => x.species_id === s));
  if (rm.length) await store.remove("trip_targets", rm);
  if (add.length) await store.save("trip_targets", add.map((species_id) => ({ trip_id: trip.id, species_id, created_at: new Date().toISOString() })));
}

export function activeTrip(ds: Dataset): Trip | null {
  return ds.trips.filter((t) => isActiveStatus(t.status)).sort((a, b) => b.started_at.localeCompare(a.started_at))[0] ?? null;
}

export function statusOf(t: Trip): "planned" | "active" | "completed" | "cancelled" {
  return t.status === "draft" ? "active" : t.status;
}

/** Start a planned trip now (keeps the planned time), and record conditions. */
export async function startTrip(store: Store, trip: Trip): Promise<Trip> {
  const now = new Date().toISOString();
  const next: Trip = { ...trip, status: "active", planned_start_at: trip.planned_start_at ?? trip.started_at, started_at: now, ended_at: null };
  await store.save("trips", next);
  if (!next.is_demo)
    void takeSnapshot(store, { at: new Date(now), tripId: next.id, catchId: null, purpose: "trip_start", coords: coordsForTrip(store.ds, next) });
  return next;
}

export async function finishTrip(store: Pick<Store, "save">, trip: Trip): Promise<Trip> {
  const now = new Date();
  const end = trip.ended_at && Date.parse(trip.ended_at) <= now.getTime() ? trip.ended_at : now.toISOString();
  const next: Trip = { ...trip, status: "completed", ended_at: Date.parse(end) >= Date.parse(trip.started_at) ? end : trip.started_at };
  await store.save("trips", next);
  return next;
}

export async function cancelTrip(store: Pick<Store, "save">, trip: Trip): Promise<Trip> {
  const next: Trip = { ...trip, status: "cancelled" };
  await store.save("trips", next);
  return next;
}

export function elapsed(fromIso: string, toMs: number, lang: "ar" | "en"): string {
  const m = Math.max(0, Math.floor((toMs - Date.parse(fromIso)) / 60_000));
  const h = Math.floor(m / 60);
  return lang === "ar" ? `${h} س ${m % 60} د` : `${h}h ${m % 60}m`;
}
