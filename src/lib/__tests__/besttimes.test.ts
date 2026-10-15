import { describe, expect, it } from "vitest";
import { MIN_PERSONAL, condFactor, profileFor, scoreDay } from "../besttimes";
import type { Pt } from "../marine/tide";
import { turningPoints } from "../marine/waqfa";

const H = 3_600_000;
// Kuwait midnight 2026-10-15 (UTC+3)
const DAY = Date.parse("2026-10-15T00:00:00+03:00");

// A clean semi-diurnal tide: 12.4 h period, ±1.5 m, high at 03:00.
function tide(): { pts: Pt[]; turns: ReturnType<typeof turningPoints> } {
  const pts: Pt[] = [];
  for (let t = DAY - 12 * H; t <= DAY + 40 * H; t += H) pts.push({ t, h: 1.5 * Math.cos(((t - (DAY + 3 * H)) / H / 12.4) * 2 * Math.PI) });
  const ext: { t: number; h: number; type: "high" | "low" }[] = [];
  for (let k = -2; k < 5; k++) {
    ext.push({ t: DAY + 3 * H + k * 12.4 * H, h: 1.5, type: "high" });
    ext.push({ t: DAY + 3 * H + (k + 0.5) * 12.4 * H, h: -1.5, type: "low" });
  }
  return { pts, turns: turningPoints(pts, ext.sort((a, b) => a.t - b.t)) };
}

const run = (over: Partial<Parameters<typeof scoreDay>[0]> = {}) => {
  const { pts, turns } = tide();
  return scoreDay({ dayStart: DAY, pts, turns, lat: 29.37, lng: 48.0, profile: profileFor("شعم"), cond: () => ({ windKmh: 8, waveM: 0.1 }), ...over });
};

describe("best fishing times", () => {
  it("scores every half hour of the day, 0..100", () => {
    const { slots } = run();
    expect(slots).toHaveLength(48);
    expect(slots.every((s) => s.score >= 0 && s.score <= 100)).toBe(true);
  });

  it("moving water scores higher than slack water at the same light", () => {
    const { slots } = run({ profile: { ...profileFor("شعم"), dawn: 0.5, dusk: 0.5, night: 0.5, day: 0.5 } }); // flat light
    const atHigh = slots.find((s) => Math.abs(s.t + 15 * 60_000 - (DAY + 3 * H)) < 20 * 60_000)!;
    const midTide = slots.find((s) => Math.abs(s.t + 15 * 60_000 - (DAY + 6.1 * H)) < 20 * 60_000)!;
    expect(midTide.move).toBeGreaterThan(atHigh.move + 0.25);
    expect(midTide.score).toBeGreaterThan(atHigh.score);
  });

  it("gives 1–3 windows, time-ordered, each with a rating and reasons", () => {
    const { windows } = run();
    expect(windows.length).toBeGreaterThan(0);
    expect(windows.length).toBeLessThanOrEqual(3);
    for (let i = 1; i < windows.length; i++) expect(windows[i].from).toBeGreaterThan(windows[i - 1].from);
    expect(["excellent", "good", "fair"]).toContain(windows[0].rating);
    expect(windows.every((w) => w.to > w.from)).toBe(true);
  });

  it("a rough sea lowers every score", () => {
    const calm = run().slots.map((s) => s.score);
    const rough = run({ cond: () => ({ windKmh: 50, waveM: 1.6 }) }).slots.map((s) => s.score);
    expect(Math.max(...rough)).toBeLessThan(Math.max(...calm));
    expect(condFactor({ windKmh: 8, waveM: 0.1 })).toBe(1);
    expect(condFactor({ windKmh: 50, waveM: 0 })).toBeLessThan(0.5);
  });

  it("uses the person's own history only after enough catches", () => {
    const few = run({ personal: { rising: 5, falling: 0, waqfa: 0, n: MIN_PERSONAL - 1 } }).slots.map((s) => s.score);
    const none = run().slots.map((s) => s.score);
    expect(few).toEqual(none);
    const many = run({ personal: { rising: MIN_PERSONAL, falling: 0, waqfa: 0, n: MIN_PERSONAL } }).slots;
    const base = run().slots;
    const i = many.findIndex((s) => s.dir === "rising" && s.score > 0 && s.score < 95);
    expect(many[i].score).toBeGreaterThan(base[i].score);
  });
});
