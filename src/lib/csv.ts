import { effectiveMoonPhase } from "./astro";
import { hijriToString, tripHijri } from "./hijri";
import { byLocation, byMonthKey, byTechnique, catchLocation, catchTechnique, type Index, type TripRow } from "./stats";
import { dateKey, toLocalInput, tripHours } from "./time";
import type { Dataset } from "./types";

type Cell = string | number | boolean | null | undefined;

export function toCSV(header: string[], rows: Cell[][]): string {
  const esc = (v: Cell) => {
    if (v == null) return "";
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // BOM so Excel opens Arabic text correctly
  return "﻿" + [header, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
}

export function tripsCSV(ds: Dataset, idx: Index, hijriOffset: number): string {
  const rows = ds.trips
    .slice()
    .sort((a, b) => a.started_at.localeCompare(b.started_at))
    .map((t) => {
      const catches = idx.catchesByTrip.get(t.id) ?? [];
      const h = tripHijri(t, hijriOffset);
      return [
        t.id,
        t.title,
        t.status,
        toLocalInput(t.started_at).replace("T", " "),
        t.ended_at ? toLocalInput(t.ended_at).replace("T", " ") : "",
        dateKey(t.started_at),
        hijriToString(h.date) + (h.corrected ? " (corrected)" : ""),
        t.location_id ? idx.locById.get(t.location_id)?.name : "",
        t.lat,
        t.lng,
        t.technique_id ? idx.techById.get(t.technique_id)?.name_en : "",
        t.target_species_id ? idx.speciesById.get(t.target_species_id)?.name_ar : "",
        catches.length,
        catches.length > 0 ? "yes" : "no",
        tripHours(t)?.toFixed(2) ?? "",
        t.weather,
        t.wind_speed_kmh,
        t.wind_dir,
        t.sea_state,
        t.water_depth_m,
        t.tide,
        t.moon_phase ?? `${effectiveMoonPhase(t).phase} (calculated)`,
        t.line_pe,
        t.lure_bait,
        t.notes,
      ];
    });
  return toCSV(
    [
      "id", "title", "status", "start_kuwait", "end_kuwait", "date", "hijri_date", "location", "lat", "lng",
      "technique", "target_species", "fish_caught", "successful", "hours", "weather", "wind_kmh", "wind_dir",
      "sea_state", "depth_m", "tide", "moon_phase", "line_pe", "lure_bait", "notes",
    ],
    rows,
  );
}

export function catchesCSV(ds: Dataset, idx: Index): string {
  const rows = ds.catches
    .slice()
    .sort((a, b) => a.caught_at.localeCompare(b.caught_at))
    .map((c) => {
      const sp = c.species_id ? idx.speciesById.get(c.species_id) : null;
      const loc = catchLocation(c, idx);
      const tech = catchTechnique(c, idx);
      return [
        c.id,
        c.trip_id,
        idx.tripById.get(c.trip_id ?? "")?.title,
        toLocalInput(c.caught_at).replace("T", " "),
        sp?.name_ar ?? "",
        sp?.name_en ?? "",
        sp?.scientific_name ?? "",
        c.identification_status,
        c.weight_kg,
        c.weight_kg != null ? (c.weight_is_estimate ? "estimated" : "measured") : "",
        c.length_cm,
        c.length_cm != null ? (c.length_is_estimate ? "estimated" : "measured") : "",
        loc ? idx.locById.get(loc)?.name : "",
        c.depth_m,
        tech ? idx.techById.get(tech)?.name_en : "",
        c.line_type,
        c.pe_rating,
        c.lure_bait,
        c.rod_reel ?? "",
        c.leader ?? "",
        c.hook ?? "",
        c.lat ?? "",
        c.lng ?? "",
        c.tide,
        c.moon_phase,
        c.released ? "released" : "kept",
        c.notes,
      ];
    });
  return toCSV(
    [
      "id", "trip_id", "trip_title", "caught_at_kuwait", "species_ar", "species_en", "scientific_name",
      "identification", "weight_kg", "weight_type", "length_cm", "length_type", "location", "depth_m",
      "technique", "line_type", "pe_rating", "lure_bait", "rod_reel", "leader", "hook", "lat", "lng", "tide", "moon_phase", "kept_released", "notes",
    ],
    rows,
  );
}

export function statsCSV(rows: TripRow[], idx: Index): string {
  const out: Cell[][] = [];
  const add = (dim: string, groups: ReturnType<typeof byTechnique>["groups"], name: (k: string) => string) => {
    for (const g of groups)
      out.push([
        dim,
        name(g.key),
        g.trips,
        g.successful,
        g.successRate != null ? (g.successRate * 100).toFixed(1) : "",
        g.catches,
        g.catchesPerTrip?.toFixed(2) ?? "",
        g.hours.toFixed(1),
        g.catchesPerHour?.toFixed(2) ?? "",
        g.sufficient ? "yes" : "no",
      ]);
  };
  add("technique", byTechnique(rows).groups, (k) => idx.techById.get(k)?.name_en ?? k);
  add("location", byLocation(rows).groups, (k) => idx.locById.get(k)?.name ?? k);
  add("month", byMonthKey(rows).groups, (k) => k);
  return toCSV(
    ["dimension", "value", "trips", "successful_trips", "success_rate_pct", "fish", "fish_per_trip", "hours", "fish_per_hour", "sample_ok(>=5)"],
    out,
  );
}

