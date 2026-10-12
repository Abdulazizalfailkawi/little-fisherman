// Realistic demo data. Every row is flagged is_demo = true so it can be
// removed in one tap from Settings without touching real records.

import { FINTAS } from "./astro";
import { uuid } from "./ids";
import { normalizeName } from "./normalize";
import type { Catch, Dataset, Equipment, Goal, Location, Trip, TripEquipment } from "./types";
import { addDays, dateKey, fromLocalInput, todayKey } from "./time";

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

export function buildDemo(ds: Dataset): {
  locations: Location[];
  equipment: Equipment[];
  trips: Trip[];
  catches: Catch[];
  trip_equipment: TripEquipment[];
  goals: Goal[];
} {
  const r = rng(20261012);
  const ts = new Date().toISOString();
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const sp = (ar: string) => ds.species.find((s) => normalizeName(s.name_ar) === normalizeName(ar))?.id ?? null;
  const tech = (code: string) => ds.techniques.find((t) => t.code === code)?.id ?? null;

  const loc = (name: string, area: string, lat: number, lng: number, kind: Location["kind"]): Location => ({
    id: uuid(), name, area, lat, lng, kind, notes: null, is_demo: true, created_at: ts, updated_at: ts,
  });
  const locations = [
    loc("ساحل الفنطاس (تجريبي)", "Al-Fintas", FINTAS.lat, FINTAS.lng, "shore"),
    loc("قاروه (تجريبي)", "Qaruh Island", 28.8167, 48.7764, "boat"),
    loc("كبر (تجريبي)", "Kubbar Island", 29.0722, 48.4933, "boat"),
    loc("فيلكا (تجريبي)", "Failaka", 29.4383, 48.3361, "boat"),
  ].filter((l) => !ds.locations.some((x) => normalizeName(x.name) === normalizeName(l.name)));

  const eq = (category: Equipment["category"], name: string, brand: string, model: string, pe: number | null): Equipment => ({
    id: uuid(), category, name, brand, model, specs: null, pe_rating: pe, photo_media_id: null, notes: null,
    retired: false, is_demo: true, created_at: ts, updated_at: ts,
  });
  const equipment = [
    eq("rod", "عصا جيقنق (تجريبي)", "Shimano", "Grappler Type J", null),
    eq("reel", "مكينة (تجريبي)", "Shimano", "Stella SW 8000", null),
    eq("line", "خيط PE3 (تجريبي)", "YGK", "X-Braid", 3),
    eq("jig", "جك 150غ (تجريبي)", "Shimano", "Butterfly", null),
    eq("lure", "ترول ريبالا (تجريبي)", "Rapala", "X-Rap Magnum 20", null),
  ];
  const allLocs = [...locations, ...ds.locations.filter((l) => l.is_demo)];
  const fintas = allLocs[0]?.id ?? null;
  const offshore = allLocs.slice(1).map((l) => l.id);

  const plans: { code: string; species: (string | null)[]; depth: [number, number] }[] = [
    { code: "jigging", species: ["هامور", "هامور", "بالول", "شعري", "جش", null], depth: [18, 35] },
    { code: "trolling", species: ["كنعد", "كنعد", "جيذر", "باراكودا", null], depth: [10, 25] },
    { code: "shore", species: ["شعم", "نقرور", "صافي", "بياح", null, null], depth: [1, 4] },
  ];

  const trips: Trip[] = [];
  const catches: Catch[] = [];
  const trip_equipment: TripEquipment[] = [];
  const today = todayKey();
  for (let i = 0; i < 26; i++) {
    const day = addDays(today, -Math.floor(4 + i * 9 + r() * 5));
    const plan = pick(plans);
    const startHour = plan.code === "shore" ? pick([5, 6, 16, 17]) : pick([4, 5, 6]);
    const start = fromLocalInput(`${day}T${String(startHour).padStart(2, "0")}:${pick(["00", "15", "30"])}`)!;
    const hours = plan.code === "shore" ? 2 + r() * 2 : 5 + r() * 4;
    const end = new Date(new Date(start).getTime() + hours * 3600_000).toISOString();
    const id = uuid();
    const locationId = plan.code === "shore" ? fintas : pick(offshore.length ? offshore : [fintas]);
    const depth = Math.round(plan.depth[0] + r() * (plan.depth[1] - plan.depth[0]));
    trips.push({
      id,
      title: null,
      status: "completed",
      started_at: start,
      ended_at: end,
      hijri_date_override: null,
      location_id: locationId,
      lat: null,
      lng: null,
      technique_id: tech(plan.code),
      target_species_id: sp(plan.species[0] ?? "هامور"),
      weather: pick(["صافٍ", "غائم جزئياً", "رطوبة عالية", null]),
      air_temp_c: null,
      wind_speed_kmh: Math.round(5 + r() * 20),
      wind_dir: pick(["N", "NW", "SE", "E"]),
      sea_state: pick(["calm", "slight", "moderate"]),
      water_depth_m: depth,
      tide: r() < 0.7 ? pick(["high", "rising", "falling", "low"]) : null,
      moon_phase: null,
      line_pe: plan.code === "shore" ? 1.5 : 3,
      lure_bait: plan.code === "jigging" ? "جك 150غ" : plan.code === "trolling" ? "Rapala X-Rap" : "روبيان",
      gear_notes: null,
      notes: "رحلة تجريبية — يمكن حذفها من الإعدادات",
      is_demo: true,
      created_at: ts,
      updated_at: ts,
    });
    if (plan.code === "jigging") {
      trip_equipment.push({ trip_id: id, equipment_id: equipment[0].id, created_at: ts });
      trip_equipment.push({ trip_id: id, equipment_id: equipment[3].id, created_at: ts });
    } else if (plan.code === "trolling") trip_equipment.push({ trip_id: id, equipment_id: equipment[4].id, created_at: ts });

    // ~30% blank trips
    const n = r() < 0.3 ? 0 : 1 + Math.floor(r() * (plan.code === "shore" ? 5 : 4));
    for (let k = 0; k < n; k++) {
      const name = pick(plan.species);
      const speciesId = name ? sp(name) : null;
      const at = new Date(new Date(start).getTime() + r() * hours * 3600_000).toISOString();
      const big = name === "هامور" || name === "بالول" || name === "كنعد" || name === "جيذر";
      const w = big ? 1.5 + r() * 6 : 0.3 + r() * 1.5;
      const measured = r() < 0.7;
      catches.push({
        id: uuid(),
        trip_id: id,
        species_id: speciesId,
        caught_at: at,
        weight_kg: r() < 0.85 ? Math.round(w * 100) / 100 : null,
        weight_is_estimate: !measured,
        length_cm: r() < 0.6 ? Math.round(big ? 45 + w * 9 : 22 + w * 12) : null,
        length_is_estimate: !measured,
        location_id: null,
        depth_m: plan.code === "shore" ? null : depth + Math.round((r() - 0.5) * 6),
        technique_id: null,
        line_type: "PE",
        pe_rating: plan.code === "shore" ? 1.5 : 3,
        lure_bait: null,
        weather: null,
        tide: null,
        moon_phase: null,
        notes: null,
        released: r() < 0.2,
        photo_media_id: null,
        identification_status: speciesId ? "manual" : "unidentified",
        ai_species_id: null,
        ai_suggestion: null,
        is_demo: true,
        created_at: ts,
        updated_at: ts,
      });
    }
  }

  const monthStart = today.slice(0, 8) + "01";
  const goals: Goal[] = [
    {
      id: uuid(), title: "صيد ٢٠ هامور", kind: "species_count", target_value: 20, species_id: sp("هامور"),
      technique_id: null, period_start: null, period_end: null, baseline: null, status: "active", is_demo: true,
      created_at: ts, updated_at: ts,
    },
    {
      id: uuid(), title: "٨ رحلات هذا الشهر", kind: "trip_count", target_value: 8, species_id: null, technique_id: null,
      period_start: monthStart, period_end: dateKey(new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7), 0, 12))),
      baseline: null, status: "active", is_demo: true, created_at: ts, updated_at: ts,
    },
  ];

  return { locations, equipment, trips, catches, trip_equipment, goals };
}
