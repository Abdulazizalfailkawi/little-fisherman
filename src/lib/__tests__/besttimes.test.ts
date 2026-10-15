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
  return scoreDay({ dayStart: DAY, pts, turns, lat: 29.37, lng: 48.0, profile: profileFor("سبيطي"), cond: () => ({ windKmh: 8, waveM: 0.1 }), ...over });
};

const nearest = (slots: ReturnType<typeof run>["slots"], target: number) => slots.reduce((b, s) => (Math.abs(s.t + 15 * 60_000 - target) < Math.abs(b.t + 15 * 60_000 - target) ? s : b));

describe("best fishing times", () => {
  it("scores every half hour of the day, 0..100", () => {
    const { slots } = run();
    expect(slots).toHaveLength(48);
    expect(slots.every((s) => s.score >= 0 && s.score <= 100)).toBe(true);
  });

  it("general fish (sobaity, shaam, nuwaibi…): best just after the slack (رشة الماء), lower before it, low in mid-tide", () => {
    const flat = { dawn: 0.5, dusk: 0.5, night: 0.5, day: 0.5 };
    const slots = run({ profile: { ...profileFor("سبيطي"), ...flat } }).slots;
    const tHigh = DAY + 3 * H;
    const after = nearest(slots, tHigh + 0.75 * H).score;
    const before = nearest(slots, tHigh - 1.5 * H).score;
    const mid = nearest(slots, tHigh + 3.1 * H).score;
    expect(after).toBeGreaterThan(before);
    expect(before).toBeGreaterThan(mid);
  });

  it("general fish like the falling tide (ثبر) a little more than the rising tide", () => {
    const p = profileFor("شعم");
    expect(p.falling).toBeGreaterThan(p.rising);
  });

  it("sunrise lifts the light factor for general fish", () => {
    const { slots, sunrise } = run();
    expect(nearest(slots, sunrise!).light).toBeGreaterThan(0.8);
  });

  it("general fish get one window of at most 4 h per tide, with the start of the run marked", () => {
    const r = run();
    expect(r.windows.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < r.windows.length; i++) expect(r.windows[i].from).toBeGreaterThanOrEqual(r.windows[i - 1].from);
    for (const w of r.windows) {
      expect(w.to - w.from).toBeLessThanOrEqual(4 * H);
      expect(w.peak?.kind).toBe("start");
      expect(w.peak!.from).toBe(w.turn!.t);
      expect(w.peak!.to - w.peak!.from).toBe(90 * 60_000);
      expect(["excellent", "good", "fair"]).toContain(w.rating);
    }
  });

  it("hamour: one window per tide, the peak is the slack itself (±30 min)", () => {
    const { pts, turns } = tide();
    const r = scoreDay({ dayStart: DAY, pts, turns, lat: 29.37, lng: 48.0, profile: profileFor("هامور"), cond: () => ({ windKmh: 8, waveM: 0.1 }) });
    const dayEnd = DAY + 24 * H;
    const inDay = turns.filter((x) => x.t + 2 * H > DAY && x.t - 2 * H < dayEnd);
    expect(r.windows).toHaveLength(inDay.length);
    for (const w of r.windows) {
      expect(w.turn).toBeTruthy();
      expect(w.peak?.kind).toBe("slack");
      expect(w.peak!.to - w.peak!.from).toBe(60 * 60_000);
      expect(w.to - w.from).toBeLessThanOrEqual(4 * H);
    }
    const tHigh = DAY + 3 * H;
    expect(nearest(r.slots, tHigh).score).toBeGreaterThan(nearest(r.slots, tHigh + 1.5 * H).score);
    expect(nearest(r.slots, tHigh + 1.5 * H).score).toBeGreaterThan(nearest(r.slots, tHigh + 3.1 * H).score);
  });

  it("balool is also active at sunset: a window covers the sunset, marked as dusk", () => {
    const { windows, sunset } = run({ profile: profileFor("بالول") });
    const covering = windows.filter((w) => sunset! >= w.from - 15 * 60_000 && sunset! <= w.to + 15 * 60_000);
    expect(covering.length).toBeGreaterThan(0);
    expect(covering.some((w) => w.why.includes("dusk"))).toBe(true);
    // hamour has no special sunset rule
    expect(profileFor("هامور").duskWindow).toBeFalsy();
    expect(profileFor("بالول").duskWindow).toBe(true);
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
    const i = many.findIndex((s, k) => s.dir === "rising" && s.score > 0 && s.score < 95 && s.score !== base[k].score);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(many[i].score).toBeGreaterThan(base[i].score);
  });
});
