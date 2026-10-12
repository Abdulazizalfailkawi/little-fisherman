// Achievements are evaluated from saved records every time data changes, so
// editing or deleting a record keeps them truthful. No achievement rewards
// or penalises a trip without catches by itself.

import { goalProgress, isMonthlyGoal } from "./goals";
import { firstCatchBySpecies, type Index, type TripRow } from "./stats";
import { monthKey } from "./time";
import type { Catch, Dataset } from "./types";

export interface AchievementDef {
  code: string;
  icon: string;
  name_ar: string;
  name_en: string;
  desc_ar: string;
  desc_en: string;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { code: "first_fish", icon: "🎣", name_ar: "أول سمكة", name_en: "First Fish Caught", desc_ar: "سجّل أول سمكة لك", desc_en: "Log your first catch" },
  { code: "first_new_species", icon: "🐟", name_ar: "أول نوع في المجموعة", name_en: "First Catch of a New Species", desc_ar: "أضف أول نوع مؤكد إلى مجموعتك", desc_en: "Add your first identified species to the collection" },
  { code: "species_5", icon: "🐠", name_ar: "٥ أنواع", name_en: "Catch 5 Different Species", desc_ar: "اصطد ٥ أنواع مختلفة", desc_en: "Catch 5 different species" },
  { code: "species_10", icon: "🐡", name_ar: "١٠ أنواع", name_en: "Catch 10 Different Species", desc_ar: "اصطد ١٠ أنواع مختلفة", desc_en: "Catch 10 different species" },
  { code: "species_x10", icon: "🏅", name_ar: "خبير نوع", name_en: "Catch a Species 10 Times", desc_ar: "اصطد نفس النوع ١٠ مرات", desc_en: "Catch the same species 10 times" },
  { code: "pb_weight", icon: "⚖️", name_ar: "رقم قياسي بالوزن", name_en: "Personal Best Weight", desc_ar: "سجّل وزناً مقاساً (ليس تقديرياً)", desc_en: "Record a measured (not estimated) weight" },
  { code: "pb_length", icon: "📏", name_ar: "رقم قياسي بالطول", name_en: "Personal Best Length", desc_ar: "سجّل طولاً مقاساً (ليس تقديرياً)", desc_en: "Record a measured (not estimated) length" },
  { code: "jigging_success", icon: "⚓", name_ar: "رحلة جيقنق ناجحة", name_en: "Successful Jigging Trip", desc_ar: "رحلة جيقنق فيها صيد واحد على الأقل", desc_en: "A jigging trip with at least one catch" },
  { code: "trolling_success", icon: "🚤", name_ar: "رحلة ترولنق ناجحة", name_en: "Successful Trolling Trip", desc_ar: "رحلة ترولنق فيها صيد واحد على الأقل", desc_en: "A trolling trip with at least one catch" },
  { code: "new_species_month", icon: "🆕", name_ar: "نوع جديد هذا الشهر", name_en: "New Species This Month", desc_ar: "اصطد نوعاً لم تصطده من قبل خلال الشهر", desc_en: "Catch a never-before-caught species this month" },
  { code: "trips_10", icon: "🗓️", name_ar: "١٠ رحلات", name_en: "Record 10 Fishing Trips", desc_ar: "سجّل ١٠ رحلات (ناجحة أو لا)", desc_en: "Log 10 trips, successful or not" },
  { code: "improve_catch_rate", icon: "📈", name_ar: "تحسّن معدل الصيد", name_en: "Improve My Catch Rate", desc_ar: "معدل آخر ٥ رحلات أعلى من معدل الرحلات السابقة (يحتاج ١٠ رحلات)", desc_en: "Your last 5 trips average more fish than your earlier trips (needs 10 trips)" },
  { code: "monthly_goal", icon: "🎯", name_ar: "إنجاز هدف شهري", name_en: "Complete a Monthly Fishing Goal", desc_ar: "حقق هدفاً مدته شهر أو أقل", desc_en: "Complete a goal whose period is a month or less" },
];

export interface AchievementState {
  def: AchievementDef;
  unlocked: boolean;
  unlockedAt: string | null; // ISO, derived from the record that unlocked it
  current: number;
  target: number;
  detail?: { ar: string; en: string };
}

function nthDistinctSpeciesDate(catches: Catch[], n: number): string | null {
  const firsts = [...firstCatchBySpecies(catches).values()].sort((a, b) => a.caught_at.localeCompare(b.caught_at));
  return firsts[n - 1]?.caught_at ?? null;
}

export function evaluateAchievements(ds: Dataset, idx: Index, rows: TripRow[], now = new Date()): AchievementState[] {
  const catches = [...ds.catches].sort((a, b) => a.caught_at.localeCompare(b.caught_at));
  const identified = catches.filter((c) => c.species_id);
  const firsts = firstCatchBySpecies(catches);
  const distinct = firsts.size;

  const perSpecies = new Map<string, Catch[]>();
  for (const c of identified) {
    const arr = perSpecies.get(c.species_id!) ?? [];
    arr.push(c);
    perSpecies.set(c.species_id!, arr);
  }
  let maxSpecies = 0;
  let x10At: string | null = null;
  for (const arr of perSpecies.values()) {
    maxSpecies = Math.max(maxSpecies, arr.length);
    if (arr.length >= 10) {
      const at = arr[9].caught_at;
      if (!x10At || at < x10At) x10At = at;
    }
  }

  const measuredW = catches.filter((c) => c.weight_kg != null && !c.weight_is_estimate);
  const measuredL = catches.filter((c) => c.length_cm != null && !c.length_is_estimate);
  const bestW = measuredW.reduce<Catch | null>((b, c) => (!b || c.weight_kg! > b.weight_kg! ? c : b), null);
  const bestL = measuredL.reduce<Catch | null>((b, c) => (!b || c.length_cm! > b.length_cm! ? c : b), null);

  const techSuccess = (code: string) => {
    const tech = idx.techByCode.get(code);
    if (!tech) return null;
    const r = rows.find((r) => r.trip.technique_id === tech.id && r.allCatches.length > 0);
    return r ? r.allCatches[0].caught_at : null;
  };

  const thisMonth = monthKey(now);
  const newThisMonth = [...firsts.values()].filter((c) => monthKey(c.caught_at) === thisMonth);
  const everNewInMonth = [...firsts.values()][0]?.caught_at ?? null;

  // Improve catch rate: last 5 trips vs all earlier ones (needs >= 10 trips).
  let improve: { ok: boolean; at: string | null; recent: number; earlier: number } | null = null;
  if (rows.length >= 10) {
    const earlier = rows.slice(0, -5);
    const recent = rows.slice(-5);
    const avg = (rs: TripRow[]) => rs.reduce((s, r) => s + r.allCatches.length, 0) / rs.length;
    const e = avg(earlier);
    const r = avg(recent);
    improve = { ok: r > e, at: r > e ? recent[recent.length - 1].trip.started_at : null, recent: r, earlier: e };
  }

  const completedMonthly = ds.goals
    .filter(isMonthlyGoal)
    .map((g) => ({ g, p: goalProgress(g, ds, idx) }))
    .filter((x) => x.p.complete);

  const states: Record<string, Omit<AchievementState, "def">> = {
    first_fish: { unlocked: catches.length > 0, unlockedAt: catches[0]?.caught_at ?? null, current: Math.min(catches.length, 1), target: 1 },
    first_new_species: { unlocked: distinct >= 1, unlockedAt: nthDistinctSpeciesDate(catches, 1), current: Math.min(distinct, 1), target: 1 },
    species_5: { unlocked: distinct >= 5, unlockedAt: nthDistinctSpeciesDate(catches, 5), current: Math.min(distinct, 5), target: 5 },
    species_10: { unlocked: distinct >= 10, unlockedAt: nthDistinctSpeciesDate(catches, 10), current: Math.min(distinct, 10), target: 10 },
    species_x10: { unlocked: maxSpecies >= 10, unlockedAt: x10At, current: Math.min(maxSpecies, 10), target: 10 },
    pb_weight: {
      unlocked: !!bestW,
      unlockedAt: bestW?.caught_at ?? null,
      current: bestW ? 1 : 0,
      target: 1,
      detail: bestW ? { ar: `${bestW.weight_kg} كغ`, en: `${bestW.weight_kg} kg` } : undefined,
    },
    pb_length: {
      unlocked: !!bestL,
      unlockedAt: bestL?.caught_at ?? null,
      current: bestL ? 1 : 0,
      target: 1,
      detail: bestL ? { ar: `${bestL.length_cm} سم`, en: `${bestL.length_cm} cm` } : undefined,
    },
    jigging_success: { unlocked: !!techSuccess("jigging"), unlockedAt: techSuccess("jigging"), current: techSuccess("jigging") ? 1 : 0, target: 1 },
    trolling_success: { unlocked: !!techSuccess("trolling"), unlockedAt: techSuccess("trolling"), current: techSuccess("trolling") ? 1 : 0, target: 1 },
    new_species_month: {
      unlocked: distinct > 0,
      unlockedAt: everNewInMonth,
      current: newThisMonth.length > 0 ? 1 : 0,
      target: 1,
      detail:
        newThisMonth.length > 0
          ? { ar: `هذا الشهر: ${newThisMonth.length} نوع جديد`, en: `This month: ${newThisMonth.length} new` }
          : { ar: "لا يوجد نوع جديد هذا الشهر بعد", en: "No new species this month yet" },
    },
    trips_10: { unlocked: rows.length >= 10, unlockedAt: rows[9]?.trip.started_at ?? null, current: Math.min(rows.length, 10), target: 10 },
    improve_catch_rate: {
      unlocked: !!improve?.ok,
      unlockedAt: improve?.at ?? null,
      current: Math.min(rows.length, 10),
      target: 10,
      detail: improve
        ? {
            ar: `آخر ٥ رحلات: ${improve.recent.toFixed(1)} / رحلة — السابق: ${improve.earlier.toFixed(1)}`,
            en: `Last 5 trips: ${improve.recent.toFixed(1)}/trip — earlier: ${improve.earlier.toFixed(1)}`,
          }
        : undefined,
    },
    monthly_goal: {
      unlocked: completedMonthly.length > 0,
      unlockedAt: completedMonthly[0]?.p.completedAt ?? null,
      current: completedMonthly.length > 0 ? 1 : 0,
      target: 1,
    },
  };

  return ACHIEVEMENTS.map((def) => ({ def, ...states[def.code] }));
}

/** The locked achievement closest to completion. */
export function nextMilestone(states: AchievementState[]): AchievementState | null {
  const locked = states.filter((s) => !s.unlocked);
  if (!locked.length) return null;
  return locked.sort((a, b) => b.current / b.target - a.current / a.target)[0];
}

