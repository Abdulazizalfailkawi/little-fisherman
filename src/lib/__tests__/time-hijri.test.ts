import { describe, it, expect } from "vitest";
import { dateKey, fromLocalInput, toLocalInput, kwParts } from "../time";
import { toHijri, hijriMonthDays, hijriForDateKey, tripHijri, hijriCalendarName } from "../hijri";
import { moonAt } from "../astro";
import { normalizeName } from "../normalize";

describe("time (Asia/Kuwait)", () => {
  it("round-trips Kuwait local input", () => {
    const iso = fromLocalInput("2026-10-12T05:30")!;
    expect(iso).toBe("2026-10-12T02:30:00.000Z");
    expect(toLocalInput(iso)).toBe("2026-10-12T05:30");
  });
  it("uses the Kuwait date near midnight UTC", () => {
    expect(dateKey("2026-10-12T22:30:00Z")).toBe("2026-10-13");
    expect(kwParts("2026-10-12T22:30:00Z").hour).toBe(1);
  });
});

describe("hijri", () => {
  it("uses Umm al-Qura", () => expect(hijriCalendarName()).toBe("islamic-umalqura"));
  it("1 Ramadan 1447 = 2026-02-18 (Umm al-Qura)", () => {
    expect(hijriForDateKey("2026-02-18")).toEqual({ year: 1447, month: 9, day: 1 });
  });
  it("month grids are contiguous with 29/30 days", () => {
    const days = hijriMonthDays(1447, 9);
    expect(days[0]).toBe("2026-02-18");
    for (let m = 1; m <= 12; m++) {
      const d = hijriMonthDays(1448, m);
      expect([29, 30]).toContain(d.length);
      expect(hijriForDateKey(d[0]).day).toBe(1);
    }
  });
  it("applies global offset and per-trip override", () => {
    const base = toHijri("2026-02-18T09:00:00Z");
    const plus = toHijri("2026-02-18T09:00:00Z", 1);
    expect(plus.day).toBe(base.day + 1);
    const t = tripHijri({ started_at: "2026-02-18T09:00:00Z", hijri_date_override: "1447-08-30" });
    expect(t.corrected).toBe(true);
    expect(t.date).toEqual({ year: 1447, month: 8, day: 30 });
  });
});

describe("moon (calculated)", () => {
  it("full moon 2026-03-03", () => expect(moonAt("2026-03-03T12:00:00Z").phase).toBe("full"));
  it("new moon 2026-02-17", () => expect(moonAt("2026-02-17T12:00:00Z").phase).toBe("new"));
});

describe("normalizeName (mirrors SQL)", () => {
  it("unifies Arabic spelling variants", () => {
    expect(normalizeName("هامُور")).toBe(normalizeName("هامور"));
    expect(normalizeName("نويبى")).toBe(normalizeName("نُوَيْبِي"));
    expect(normalizeName("شعـــم")).toBe("شعم");
    expect(normalizeName("Orange-spotted  Grouper")).toBe("orangespottedgrouper");
  });
});
