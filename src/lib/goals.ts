import { tripRows, type Index } from "./stats";
import { dateKey } from "./time";
import type { Catch, Dataset, Goal } from "./types";

export interface GoalProgress {
  current: number;
  target: number;
  ratio: number; // 0..1
  complete: boolean;
  completedAt: string | null;
  sample?: number; // trips counted, for rate-based goals
  note?: { ar: string; en: string };
}

function inPeriod(g: Goal, iso: string): boolean {
  const k = dateKey(iso);
  if (g.period_start && k < g.period_start) return false;
  if (g.period_end && k > g.period_end) return false;
  return true;
}

export function isMonthlyGoal(g: Goal): boolean {
  if (!g.period_start || !g.period_end) return false;
  const days = (Date.parse(g.period_end) - Date.parse(g.period_start)) / 86_400_000;
  return days >= 0 && days <= 31;
}

/** Date at which the running count first reached the target. */
function reachedAt(items: { at: string }[], target: number): string | null {
  const sorted = [...items].sort((a, b) => a.at.localeCompare(b.at));
  return sorted.length >= target ? sorted[Math.ceil(target) - 1].at : null;
}

export function goalProgress(g: Goal, ds: Dataset, idx: Index): GoalProgress {
  const catches = ds.catches.filter((c) => inPeriod(g, c.caught_at));
  const trips = ds.trips.filter((t) => t.status === "completed" && inPeriod(g, t.started_at));
  const target = Number(g.target_value);
  const techOf = (c: Catch) => c.technique_id ?? idx.tripById.get(c.trip_id ?? "")?.technique_id ?? null;

  const make = (current: number, completedAt: string | null, extra: Partial<GoalProgress> = {}): GoalProgress => ({
    current,
    target,
    ratio: Math.max(0, Math.min(1, current / target)),
    complete: current >= target,
    completedAt: current >= target ? completedAt : null,
    ...extra,
  });

  switch (g.kind) {
    case "species_count": {
      const cs = catches.filter((c) => c.species_id === g.species_id && (!g.technique_id || techOf(c) === g.technique_id));
      return make(cs.length, reachedAt(cs.map((c) => ({ at: c.caught_at })), target));
    }
    case "species_with_technique": {
      const cs = catches.filter((c) => c.species_id === g.species_id && techOf(c) === g.technique_id);
      return make(cs.length, reachedAt(cs.map((c) => ({ at: c.caught_at })), target));
    }
    case "catch_count":
      return make(catches.length, reachedAt(catches.map((c) => ({ at: c.caught_at })), target));
    case "trip_count":
      return make(trips.length, reachedAt(trips.map((t) => ({ at: t.started_at })), target));
    case "distinct_species": {
      const first = new Map<string, string>();
      for (const c of [...catches].sort((a, b) => a.caught_at.localeCompare(b.caught_at)))
        if (c.species_id && !first.has(c.species_id)) first.set(c.species_id, c.caught_at);
      return make(first.size, reachedAt([...first.values()].map((at) => ({ at })), target));
    }
    case "fish_over_weight": {
      const cs = catches.filter((c) => c.weight_kg != null && (!g.species_id || c.species_id === g.species_id));
      const best = cs.reduce<Catch | null>((b, c) => (!b || c.weight_kg! > b.weight_kg! ? c : b), null);
      const hit = cs
        .filter((c) => c.weight_kg! >= target)
        .sort((a, b) => a.caught_at.localeCompare(b.caught_at))[0];
      return make(best?.weight_kg ?? 0, hit?.caught_at ?? null, {
        note: hit?.weight_is_estimate ? { ar: "الوزن تقديري", en: "Weight is an estimate" } : undefined,
      });
    }
    case "fish_over_length": {
      const cs = catches.filter((c) => c.length_cm != null && (!g.species_id || c.species_id === g.species_id));
      const best = cs.reduce<Catch | null>((b, c) => (!b || c.length_cm! > b.length_cm! ? c : b), null);
      const hit = cs
        .filter((c) => c.length_cm! >= target)
        .sort((a, b) => a.caught_at.localeCompare(b.caught_at))[0];
      return make(best?.length_cm ?? 0, hit?.caught_at ?? null);
    }
    case "technique_success_rate": {
      const rows = tripRows(ds, idx, {
        techniqueId: g.technique_id ?? undefined,
        from: g.period_start ?? undefined,
        to: g.period_end ?? undefined,
      });
      const n = rows.length;
      const rate = n ? (rows.filter((r) => r.success).length / n) * 100 : 0;
      const enough = n >= 3;
      return {
        ...make(enough ? rate : Math.min(rate, target - 0.01), null, { sample: n }),
        complete: enough && rate >= target,
        completedAt: enough && rate >= target ? rows[n - 1].trip.started_at : null,
        note: enough
          ? undefined
          : { ar: "يحتاج ٣ رحلات على الأقل بهذه الطريقة", en: "Needs at least 3 trips with this technique" },
      };
    }
  }
}
