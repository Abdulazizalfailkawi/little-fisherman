import { describe, expect, it } from "vitest";
import { catchesByTurn, depthBins, lurePerformance, targetPerformance, targetVsActual } from "../analyticsExtra";
import { cascadeDelete } from "../db/sync";
import { newCatch, newTrip, prefillFromTrip } from "../factory";
import { speciesTargetAnalytics } from "../speciesAnalytics";
import { buildIndex, summarize, tripRows, records } from "../stats";
import { activeTrip, statusOf, targetsOf } from "../trips";
import { emptyDataset, type Dataset, type Species } from "../types";

const ts = "2026-01-01T00:00:00.000Z";
const H = 3_600_000;
const sp = (id: string, ar: string): Species => ({ id, name_ar: ar, name_en: id, scientific_name: null, aliases: [], family: null, notes: null, cover_media_id: null, is_builtin: true, created_at: ts, updated_at: ts });

function data(): Dataset {
  const ds = emptyDataset();
  ds.species = [sp("bal", "بالول"), sp("ham", "هامور"), sp("kan", "كنعد")];
  const trip = (id: string, start: string, status: "planned" | "active" | "completed" | "cancelled", target: string | null, extra = {}) =>
    newTrip({ id, status, started_at: start, ended_at: status === "completed" ? new Date(Date.parse(start) + 4 * H).toISOString() : null, target_species_id: target, ...extra });
  ds.trips = [
    trip("A", "2026-09-01T02:00:00Z", "completed", "bal", { target_depth_m: 20, target_depth_max_m: 25, lure_type: "Rapala X-Rap", lure_weight_g: 30 }), // Balool caught
    trip("B", "2026-09-02T02:00:00Z", "completed", "bal"), // other species caught
    trip("C", "2026-09-03T02:00:00Z", "completed", "bal"), // zero catches
    trip("D", "2026-09-04T02:00:00Z", "completed", "bal"), // multi-target bal+kan, kan caught
    trip("P", "2026-10-20T02:00:00Z", "planned", "bal"),
    trip("X", "2026-09-05T02:00:00Z", "cancelled", "bal"),
    trip("L", "2026-10-13T02:00:00Z", "active", "bal"),
  ];
  ds.trip_targets = [{ trip_id: "D", species_id: "kan", created_at: ts }];
  const A = ds.trips[0];
  ds.catches = [
    newCatch(A, { ...prefillFromTrip(A), id: "a1", species_id: "bal", caught_at: "2026-09-01T03:00:00Z", depth_m: 22, weight_kg: 3.1 }),
    newCatch(A, { id: "a2", species_id: "bal", caught_at: "2026-09-01T04:00:00Z" }), // no depth/weight/length
    newCatch(ds.trips[1], { id: "b1", species_id: "ham", caught_at: "2026-09-02T03:00:00Z", depth_m: 12 }),
    newCatch(ds.trips[3], { id: "d1", species_id: "kan", caught_at: "2026-09-04T03:00:00Z" }),
    newCatch(null, { id: "s1", species_id: "bal", caught_at: "2026-09-06T03:00:00Z" }), // not linked to a trip
  ];
  return ds;
}

describe("trip lifecycle & targets", () => {
  it("statistics use completed trips only; zero-catch trips count as unsuccessful", () => {
    const ds = data();
    const idx = buildIndex(ds);
    const s = summarize(tripRows(ds, idx));
    expect(s.trips).toBe(4); // A, B, C, D (planned, cancelled, active excluded)
    expect(s.successful).toBe(3);
    expect(s.blank).toBe(1);
    expect(activeTrip(ds)?.id).toBe("L");
    expect(statusOf({ ...ds.trips[0], status: "draft" })).toBe("active");
  });

  it("Balool target trips: caught vs other species vs zero catches; multi-target counted per target", () => {
    const ds = data();
    const idx = buildIndex(ds);
    const a = speciesTargetAnalytics(ds, idx, "bal");
    expect(a.targetTrips).toBe(4); // A, B, C, D
    expect(a.successful).toBe(1); // only A caught Balool
    expect(a.fishOnTargetTrips).toBe(2);
    expect(a.fishOnOtherTrips).toBe(1); // stand-alone s1
    expect(targetsOf(ds, ds.trips[3])).toEqual(["bal", "kan"]);
    const perf = targetPerformance(ds, tripRows(ds, idx));
    const bal = perf.find((p) => p.speciesId === "bal")!;
    const kan = perf.find((p) => p.speciesId === "kan")!;
    expect(bal).toMatchObject({ trips: 4, successful: 1, zeroCatch: 1, targetCatches: 2 });
    expect(bal.rate).toBeCloseTo(0.25);
    expect(kan).toMatchObject({ trips: 1, successful: 1 });
  });

  it("catch prefill comes from the trip plan and stays editable", () => {
    const ds = data();
    const p = prefillFromTrip(ds.trips[0]);
    expect(p).toMatchObject({ depth_m: 20, lure_bait: "Rapala X-Rap", lure_weight_g: 30 });
    expect(newCatch(null).trip_id).toBeNull();
  });

  it("missing measurements are counted as missing, never as zero", () => {
    const ds = data();
    const idx = buildIndex(ds);
    const d = depthBins(ds.catches, 5);
    expect(d.known).toBe(2);
    expect(d.missing).toBe(3);
    expect(d.bins.map((b) => b.label)).toEqual(["10–15", "20–25"]);
    const tv = targetVsActual(ds.catches, idx);
    expect(tv).toMatchObject({ n: 1, within: 1 });
    expect(tv.avgDiff).toBeCloseTo(-0.5);
    const r = records(tripRows(ds, idx), ds.catches);
    expect(r.heaviest.measured?.id).toBe("a1");
    const lure = lurePerformance(idx, ds.catches, tripRows(ds, idx));
    expect(lure.lures[0]).toMatchObject({ catches: 2, tripsUsed: 1 });
    expect(lure.missing).toBe(3);
    expect(catchesByTurn(ds, ds.catches).missing).toBe(5); // no snapshots → no tide timing invented
  });

  it("statistics recalculate after editing and deleting", () => {
    let ds = data();
    // edit: B's catch becomes a Balool → B becomes a successful Balool trip
    ds.catches = ds.catches.map((c) => (c.id === "b1" ? { ...c, species_id: "bal" } : c));
    expect(speciesTargetAnalytics(ds, buildIndex(ds), "bal").successful).toBe(2);
    // delete A's Balool catches → A no longer successful
    ds = cascadeDelete(ds, "catches", ds.catches.filter((c) => c.trip_id === "A") as never).ds;
    const idx = buildIndex(ds);
    expect(speciesTargetAnalytics(ds, idx, "bal").successful).toBe(1);
    expect(summarize(tripRows(ds, idx)).blank).toBe(2);
    // deleting a trip removes its targets and catches
    ds = cascadeDelete(ds, "trips", [ds.trips.find((t) => t.id === "D")] as never).ds;
    expect(ds.trip_targets).toHaveLength(0);
    expect(ds.catches.some((c) => c.id === "d1")).toBe(false);
  });
});
