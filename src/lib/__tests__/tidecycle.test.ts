import { describe, expect, it } from "vitest";
import { DEFAULT_CYCLE, cycleForHijriDay, cycleInfo, cycleOnDate, inRange, overlaps, parseRanges } from "../tidecycle";
import { hijriForDateKey } from "../hijri";

describe("الحمل والفساد", () => {
  it("handles ranges that wrap across the month end", () => {
    expect(inRange(29, [28, 3])).toBe(true);
    expect(inRange(2, [28, 3])).toBe(true);
    expect(inRange(10, [28, 3])).toBe(false);
  });

  it("default mapping by Hijri day", () => {
    expect(cycleForHijriDay(1)).toBe("hamal");
    expect(cycleForHijriDay(15)).toBe("hamal");
    expect(cycleForHijriDay(8)).toBe("fasad");
    expect(cycleForHijriDay(22)).toBe("fasad");
    expect(cycleForHijriDay(4)).toBe("between");
    expect(overlaps(DEFAULT_CYCLE)).toBe(false);
  });

  it("uses the app Hijri date, including the global offset", () => {
    // 2026-10-12 = 1 Jumada al-Ula 1448 (Umm al-Qura) → Haml
    expect(hijriForDateKey("2026-10-12").day).toBe(1);
    expect(cycleOnDate("2026-10-12")).toBe("hamal");
    // offset +3 → Hijri day 4 → transitional
    expect(cycleOnDate("2026-10-12", 3)).toBe("between");
  });

  it("counts the day number within the current run", () => {
    // Haml 28–3 began on Hijri 28 of the previous month
    const info = cycleInfo("2026-10-12");
    expect(info.cycle).toBe("hamal");
    expect(info.day).toBeGreaterThanOrEqual(3);
    expect(info.day).toBeLessThanOrEqual(4);
  });

  it("parses and validates user ranges (Arabic digits too)", () => {
    expect(parseRanges("13-18, 28-3")).toEqual([
      [13, 18],
      [28, 3],
    ]);
    expect(parseRanges("١٣-١٨، ٢٨-٣")).toEqual([
      [13, 18],
      [28, 3],
    ]);
    expect(parseRanges("40-2")).toBeNull();
    expect(parseRanges("abc")).toBeNull();
    expect(overlaps({ hamal: [[10, 15]], fasad: [[15, 20]] })).toBe(true);
  });
});
