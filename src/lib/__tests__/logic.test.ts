import { describe, expect, it } from "vitest";
import { evaluateAchievements } from "../achievements";
import { parseBackup, BACKUP_FORMAT } from "../backup";
import { cascadeDelete, overlay, planMerge } from "../db/sync";
import { newCatch, newTrip } from "../factory";
import { goalProgress } from "../goals";
import { buildIndex, byHour, byTechnique, byTide, records, summarize, tripRows, weeklyTripStreak } from "../stats";
import { emptyDataset, type Dataset, type Goal, type Species, type Technique } from "../types";

const ts = "2026-01-01T00:00:00.000Z";
const tech = (code: string): Technique => ({ id: `t-${code}`, code, name_ar: code, name_en: code, is_builtin: true, sort_order: 1, created_at: ts, updated_at: ts });
const sp = (id: string, ar: string, en: string): Species => ({
  id, name_ar: ar, name_en: en, scientific_name: null, aliases: [], family: null, notes: null, cover_media_id: null, is_builtin: true, created_at: ts, updated_at: ts,
});

function fixture(): Dataset {
  const ds = emptyDataset();
  ds.techniques = [tech("jigging"), tech("trolling")];
  ds.species = [sp("s-hamour", "هامور", "Grouper"), sp("s-kanad", "كنعد", "Kingfish")];
  // 3 jigging trips (2 successful), 2 trolling trips (1 successful), 1 draft
  const mk = (i: number, code: string, start: string, hours: number, tide: "high" | null = null) =>
    newTrip({
      id: `trip-${i}`,
      status: "completed",
      technique_id: `t-${code}`,
      started_at: start,
      ended_at: new Date(new Date(start).getTime() + hours * 3600_000).toISOString(),
      tide,
    });
  ds.trips = [
    mk(1, "jigging", "2026-03-01T02:00:00.000Z", 4, "high"),
    mk(2, "jigging", "2026-03-08T02:00:00.000Z", 4),
    mk(3, "jigging", "2026-03-15T02:00:00.000Z", 4, "high"),
    mk(4, "trolling", "2026-03-22T02:00:00.000Z", 2),
    mk(5, "trolling", "2026-03-29T02:00:00.000Z", 2),
    newTrip({ id: "trip-draft", status: "draft", started_at: "2026-04-01T02:00:00.000Z" }),
  ];
  const c = (id: string, trip: string, species: string | null, at: string, w?: number, est = false) =>
    newCatch(ds.trips.find((t) => t.id === trip)!, { id, species_id: species, caught_at: at, weight_kg: w ?? null, weight_is_estimate: est });
  ds.catches = [
    c("c1", "trip-1", "s-hamour", "2026-03-01T03:00:00.000Z", 3),
    c("c2", "trip-1", "s-hamour", "2026-03-01T03:30:00.000Z", 9, true), // estimated, must not be the record
    c("c3", "trip-3", "s-kanad", "2026-03-15T04:00:00.000Z", 5),
    c("c4", "trip-4", "s-kanad", "2026-03-22T03:00:00.000Z"),
    c("c5", "trip-draft", "s-hamour", "2026-04-01T03:00:00.000Z", 2),
  ];
  return ds;
}

describe("stats", () => {
  const ds = fixture();
  const idx = buildIndex(ds);
  const rows = tripRows(ds, idx);

  it("includes blank trips, excludes drafts from trip rates", () => {
    const s = summarize(rows);
    expect(s.trips).toBe(5);
    expect(s.successful).toBe(3);
    expect(s.blank).toBe(2);
    expect(s.successRate).toBeCloseTo(0.6);
    expect(s.catches).toBe(4); // draft catch not in trip stats
    expect(s.hours).toBeCloseTo(16);
    expect(s.catchesPerHour).toBeCloseTo(4 / 16);
  });

  it("groups by technique with sample-size flags", () => {
    const g = byTechnique(rows).groups;
    const jig = g.find((x) => x.key === "t-jigging")!;
    expect(jig.trips).toBe(3);
    expect(jig.successful).toBe(2);
    expect(jig.sufficient).toBe(false); // < 5 trips
  });

  it("never guesses tide: unrecorded trips are counted as missing", () => {
    const t = byTide(rows);
    expect(t.missing).toBe(3);
    expect(t.groups).toHaveLength(1);
    expect(t.groups[0].trips).toBe(2);
  });

  it("species filter changes success to 'caught that species'", () => {
    const r = tripRows(ds, idx, { speciesId: "s-kanad" });
    expect(summarize(r).successful).toBe(2);
    expect(summarize(r).catches).toBe(2);
  });

  it("hour rates use exposure (time actually fished)", () => {
    const h = byHour(rows);
    // trips start 02:00 UTC = 05:00 Kuwait; catches at 06:00/06:30 KWT etc.
    const six = h.find((x) => x.hour === 6)!;
    expect(six.catches).toBe(3);
    expect(six.exposureHours).toBeCloseTo(5); // five trips each fished 06:00–07:00
  });

  it("records prefer measured weights", () => {
    const r = records(rows, ds.catches);
    expect(r.heaviest.measured?.id).toBe("c3");
    expect(r.heaviest.estimated?.id).toBe("c2");
    expect(r.mostFishTrip?.count).toBe(2);
  });

  it("weekly streak counts weeks with trips, not catches", () => {
    expect(weeklyTripStreak(ds.trips, "2026-03-30")).toBe(5);
    expect(weeklyTripStreak(ds.trips, "2026-05-30")).toBe(0);
  });
});

describe("achievements & goals", () => {
  const ds = fixture();
  const idx = buildIndex(ds);
  const rows = tripRows(ds, idx);
  const st = evaluateAchievements(ds, idx, rows, new Date("2026-03-20T00:00:00Z"));
  const get = (code: string) => st.find((s) => s.def.code === code)!;

  it("unlocks from data with derived dates", () => {
    expect(get("first_fish").unlocked).toBe(true);
    expect(get("first_fish").unlockedAt).toBe("2026-03-01T03:00:00.000Z");
    expect(get("jigging_success").unlocked).toBe(true);
    expect(get("trolling_success").unlocked).toBe(true);
    expect(get("species_5").unlocked).toBe(false);
    expect(get("species_5").current).toBe(2);
    expect(get("pb_weight").unlocked).toBe(true);
    expect(get("trips_10").current).toBe(5);
  });

  it("goal progress respects species and period", () => {
    const g: Goal = {
      id: "g", title: "x", kind: "species_count", target_value: 3, species_id: "s-hamour", technique_id: null,
      period_start: null, period_end: null, baseline: null, status: "active", is_demo: false, created_at: ts, updated_at: ts,
    };
    expect(goalProgress(g, ds, idx).current).toBe(3);
    expect(goalProgress(g, ds, idx).complete).toBe(true);
    expect(goalProgress({ ...g, period_start: "2026-03-02", period_end: "2026-03-31" }, ds, idx).current).toBe(0);
    const w = goalProgress({ ...g, kind: "fish_over_weight", target_value: 8, species_id: null }, ds, idx);
    expect(w.complete).toBe(true);
    expect(w.note?.en).toMatch(/estimate/);
  });
});

describe("sync helpers", () => {
  it("cascade delete removes children and nulls references", () => {
    const ds = fixture();
    const { ds: next, deleted } = cascadeDelete(ds, "trips", [ds.trips[0] as never]);
    expect(next.trips).toHaveLength(5);
    expect(next.catches.find((c) => c.trip_id === "trip-1")).toBeUndefined();
    expect(deleted.find((d) => d.table === "catches")?.keys).toEqual(["c1", "c2"]);
    const r2 = cascadeDelete(ds, "species", [ds.species[0] as never]);
    expect(r2.ds.catches.find((c) => c.id === "c1")?.species_id).toBeNull();
  });

  it("overlay re-applies pending local changes over server data", () => {
    const server = fixture();
    const local = newTrip({ id: "new-trip" });
    const merged = overlay(server, [
      { seq: 1, table: "trips", op: "upsert", key: "new-trip", row: local as never, createdAt: ts, attempts: 0 },
      { seq: 2, table: "catches", op: "delete", key: "c3", row: server.catches[2] as never, createdAt: ts, attempts: 0 },
    ]);
    expect(merged.trips.some((t) => t.id === "new-trip")).toBe(true);
    expect(merged.catches.some((c) => c.id === "c3")).toBe(false);
  });

  it("merge maps duplicate species/techniques by name instead of duplicating", () => {
    const server = fixture();
    const local = fixture();
    local.species = [sp("local-h", "هامُور", "grouper")]; // spelling variant
    local.techniques = [{ ...tech("jigging"), id: "local-jig" }];
    local.catches = [newCatch(local.trips[0], { id: "lc", species_id: "local-h", technique_id: "local-jig" })];
    const plan = planMerge(local, server);
    expect(plan.find((p) => p.table === "species")!.rows).toHaveLength(0);
    const catchRow = plan.find((p) => p.table === "catches")!.rows[0];
    expect(catchRow.species_id).toBe("s-hamour");
    expect(catchRow.technique_id).toBe("t-jigging");
  });
});

describe("backup", () => {
  it("round-trips and rejects foreign files", () => {
    const ds = fixture();
    const parsed = parseBackup(JSON.stringify({ format: BACKUP_FORMAT, version: 1, exported_at: ts, data: ds }));
    expect(parsed.data.trips).toHaveLength(6);
    expect(() => parseBackup("{}")).toThrow("NOT_A_BACKUP");
    expect(() => parseBackup("nope")).toThrow("INVALID_JSON");
    expect(() =>
      parseBackup(JSON.stringify({ format: BACKUP_FORMAT, version: 1, data: { trips: [{ title: "no id" }] } })),
    ).toThrow("BAD_KEY");
  });
});
