// Period reports built only from real records (demo rows are excluded).

import { tripEnv } from "./marine/env";
import { byLocation, byTechnique, records, speciesCounts, summarize, tripRows, type Index, type Records, type Summary } from "./stats";
import { addDays, dateKey, todayKey, weekStartKey } from "./time";
import type { Catch, Dataset } from "./types";

export type Period = "week" | "month" | "year" | "custom";

export function periodRange(p: Period, anchor = todayKey(), custom?: { from: string; to: string }): { from: string; to: string } {
  if (p === "custom" && custom) return custom;
  if (p === "week") {
    const from = weekStartKey(anchor);
    return { from, to: addDays(from, 6) };
  }
  if (p === "month") {
    const [y, m] = anchor.split("-").map(Number);
    return { from: `${anchor.slice(0, 7)}-01`, to: dateKey(new Date(Date.UTC(y, m, 0, 12))) };
  }
  return { from: `${anchor.slice(0, 4)}-01-01`, to: `${anchor.slice(0, 4)}-12-31` };
}

export interface Report {
  from: string;
  to: string;
  summary: Summary;
  catches: Catch[];
  species: { speciesId: string | null; count: number }[];
  techniques: ReturnType<typeof byTechnique>["groups"];
  spots: ReturnType<typeof byLocation>["groups"];
  records: Records;
  tide: { key: string; trips: number; successful: number }[];
  tideMissing: number;
  moon: { key: string; trips: number; successful: number }[];
  excludedDemo: number;
  sentences: { ar: string; en: string }[];
}

/** Dataset without demo rows. */
export function realOnly(ds: Dataset): Dataset {
  const demoTrips = new Set(ds.trips.filter((t) => t.is_demo).map((t) => t.id));
  return {
    ...ds,
    trips: ds.trips.filter((t) => !t.is_demo),
    catches: ds.catches.filter((c) => !c.is_demo && !demoTrips.has(c.trip_id)),
  };
}

export function buildReport(dsAll: Dataset, idxAll: Index, range: { from: string; to: string }, hijriOffset: number, names: (kind: "species" | "tech" | "loc", id: string | null, lang: "ar" | "en") => string): Report {
  const ds = realOnly(dsAll);
  const excludedDemo = dsAll.trips.filter((t) => t.is_demo && dateKey(t.started_at) >= range.from && dateKey(t.started_at) <= range.to).length;
  const rows = tripRows(ds, idxAll, range, hijriOffset).filter((r) => !r.trip.is_demo);
  const s = summarize(rows);
  const catches = rows.flatMap((r) => r.catches);
  const species = speciesCounts(catches);
  const techniques = byTechnique(rows).groups.sort((a, b) => b.catches - a.catches);
  const spots = byLocation(rows).groups.sort((a, b) => b.catches - a.catches);
  const rec = records(rows, catches);

  const tideMap = new Map<string, { trips: number; successful: number }>();
  let tideMissing = 0;
  const moonMap = new Map<string, { trips: number; successful: number }>();
  for (const r of rows) {
    const e = tripEnv(ds, r.trip);
    const tk = e.tidePhase?.value ?? null;
    if (tk) {
      const v = tideMap.get(tk) ?? { trips: 0, successful: 0 };
      v.trips++;
      if (r.success) v.successful++;
      tideMap.set(tk, v);
    } else tideMissing++;
    const mk = r.moon.phase;
    const mv = moonMap.get(mk) ?? { trips: 0, successful: 0 };
    mv.trips++;
    if (r.success) mv.successful++;
    moonMap.set(mk, mv);
  }

  const sentences: { ar: string; en: string }[] = [];
  if (!s.trips) sentences.push({ ar: "لا توجد رحلات مسجلة في هذه الفترة.", en: "No trips recorded in this period." });
  else {
    sentences.push({
      ar: `صدت ${s.catches} سمكة خلال ${s.trips} رحلة (${s.successful} ناجحة، ${s.blank} بدون صيد).`,
      en: `You caught ${s.catches} fish across ${s.trips} trips (${s.successful} successful, ${s.blank} without a catch).`,
    });
    const top = species.find((x) => x.speciesId);
    if (top)
      sentences.push({
        ar: `أكثر نوع صدته: ${names("species", top.speciesId, "ar")} (${top.count}).`,
        en: `Your most frequently caught species was ${names("species", top.speciesId, "en")} (${top.count}).`,
      });
    if (techniques.length > 1)
      sentences.push({
        ar: techniques.map((g) => `${names("tech", g.key, "ar")}: ${g.catches} سمكة في ${g.trips} رحلة`).join("، ") + ".",
        en: techniques.map((g) => `${names("tech", g.key, "en")} produced ${g.catches} fish in ${g.trips} trips`).join("; ") + ".",
      });
    const bestSpot = spots[0];
    if (bestSpot && bestSpot.catches > 0)
      sentences.push({
        ar: `أكثر موقع مسجل إنتاجاً: ${names("loc", bestSpot.key, "ar")} (${bestSpot.catches} سمكة في ${bestSpot.trips} رحلة).`,
        en: `Your most productive recorded spot was ${names("loc", bestSpot.key, "en")} (${bestSpot.catches} fish in ${bestSpot.trips} trips).`,
      });
    if (rec.heaviest.measured)
      sentences.push({
        ar: `أثقل سمكة مقاسة: ${rec.heaviest.measured.weight_kg} كغ (${names("species", rec.heaviest.measured.species_id, "ar")}).`,
        en: `Heaviest measured fish: ${rec.heaviest.measured.weight_kg} kg (${names("species", rec.heaviest.measured.species_id, "en")}).`,
      });
  }

  return {
    ...range,
    summary: s,
    catches,
    species,
    techniques,
    spots,
    records: rec,
    tide: [...tideMap.entries()].map(([key, v]) => ({ key, ...v })),
    tideMissing,
    moon: [...moonMap.entries()].map(([key, v]) => ({ key, ...v })),
    excludedDemo,
    sentences,
  };
}

