import { describe, expect, it } from "vitest";
import { cleanSeries, findExtrema } from "../marine/tide";
import { WAQFA_MAX_HALF_MIN, minutesToNearestTurn, smoothSeries, tideState, turningPoints, turningPointsFromEvents } from "../marine/waqfa";

const H = 3_600_000;
const T0 = Date.parse("2026-10-13T00:00:00Z");
function series(amp: number, hours = 48) {
  return cleanSeries(
    Array.from({ length: hours + 1 }, (_, i) => {
      const t = T0 + i * H;
      return { t: new Date(t).toISOString(), h: amp * Math.cos((2 * Math.PI * (t - (T0 + 3 * H))) / (12.42 * H)) };
    }),
  );
}

describe("waqfa (turning periods)", () => {
  it("turning point ≈ true high water; waqfa window from the 5 cm/h rate threshold", () => {
    const pts = series(1.2);
    const turns = turningPoints(pts, findExtrema(pts));
    const hi = turns[0];
    expect(hi.type).toBe("high");
    expect(Math.abs(hi.t - (T0 + 3 * H))).toBeLessThan(15 * 60_000);
    // analytic: |rate| = A·ω²·|dt| ⇒ half-width = 0.05/(A·ω²) h
    const w = (2 * Math.PI) / 12.42;
    const expectedHalfMin = (0.05 / (1.2 * w * w)) * 60;
    const half = (hi.waqfaEnd! - hi.waqfaStart!) / 2 / 60_000;
    expect(Math.abs(half - expectedHalfMin)).toBeLessThan(5);
    expect(hi.uncertaintyMin).toBe(30);
    expect(hi.flat).toBe(false);
  });

  it("flat (weak/neap) curves are capped and flagged, not stretched", () => {
    const pts = series(0.1);
    const turns = turningPoints(pts, findExtrema(pts, 0.05));
    expect(turns[0].flat).toBe(true);
    expect((turns[0].waqfaEnd! - turns[0].t) / 60_000).toBeLessThanOrEqual(WAQFA_MAX_HALF_MIN);
  });

  it("direction: سجي before high, ثبر after, وقفة inside the window", () => {
    const pts = series(1.2);
    const turns = turningPoints(pts, findExtrema(pts));
    expect(tideState(pts, turns, T0 + 1 * H).direction).toBe("rising");
    expect(tideState(pts, turns, T0 + 3 * H).direction).toBe("waqfa");
    expect(tideState(pts, turns, T0 + 6 * H).direction).toBe("falling");
    const s = tideState(pts, turns, T0 + 6 * H);
    expect(s.next?.type).toBe("low");
    expect(s.rateCmPerH!).toBeLessThan(0);
  });

  it("countdown target moves to the next turning point once one passes", () => {
    const pts = series(1.2);
    const turns = turningPoints(pts, findExtrema(pts));
    const before = tideState(pts, turns, turns[0].t - 60_000).next!;
    const after = tideState(pts, turns, turns[0].t + 60_000).next!;
    expect(before.t).toBe(turns[0].t);
    expect(after.t).toBe(turns[1].t);
    expect(after.type).toBe("low");
  });

  it("events-only (manual): no invented waqfa duration", () => {
    const turns = turningPointsFromEvents([
      { t: T0 + 9 * H, h: null, type: "low" },
      { t: T0 + 3 * H, h: 1.4, type: "high" },
    ]);
    expect(turns[0].type).toBe("high");
    expect(turns.every((x) => x.waqfaStart == null && x.uncertaintyMin == null)).toBe(true);
    const st = tideState([], turns, T0 + 5 * H);
    expect(st.direction).toBe("falling");
    expect(st.level).toBeNull();
    expect(minutesToNearestTurn(turns, T0 + 2 * H)!.minutes).toBe(-60);
  });

  it("smoothing passes through the samples without overshoot", () => {
    const pts = series(1.2, 12);
    const sm = smoothSeries(pts);
    const max = Math.max(...pts.map((p) => p.h));
    expect(Math.max(...sm.map((p) => p.h))).toBeLessThanOrEqual(max + 1e-9);
    expect(sm[0].h).toBeCloseTo(pts[0].h);
  });
});
