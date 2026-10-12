// Astronomical values (sun & moon) are *calculated*, not observed. They are
// deterministic for a time and place, so using them is not "inventing"
// environmental data — but the UI always labels them as calculated.
import * as SunCalc from "suncalc";
import type { MoonPhase } from "./types";

/** Default reference point when a trip has no coordinates: Kuwait City coast. */
export const KUWAIT_DEFAULT = { lat: 29.3759, lng: 47.9774 };
/** Al-Fintas coast, used as an example spot in demo data. */
export const FINTAS = { lat: 29.1736, lng: 48.1206 };

export function moonPhaseFromFraction(phase: number): MoonPhase {
  // phase: 0 = new, 0.25 = first quarter, 0.5 = full, 0.75 = last quarter
  const p = ((phase % 1) + 1) % 1;
  if (p < 0.0339 || p >= 0.9661) return "new";
  if (p < 0.2161) return "waxing_crescent";
  if (p < 0.2839) return "first_quarter";
  if (p < 0.4661) return "waxing_gibbous";
  if (p < 0.5339) return "full";
  if (p < 0.7161) return "waning_gibbous";
  if (p < 0.7839) return "last_quarter";
  return "waning_crescent";
}

export function moonAt(iso: string | Date): { phase: MoonPhase; illumination: number; fraction: number } {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const m = SunCalc.getMoonIllumination(d);
  return { phase: moonPhaseFromFraction(m.phase), illumination: m.fraction, fraction: m.phase };
}

export function sunTimes(iso: string | Date, lat = KUWAIT_DEFAULT.lat, lng = KUWAIT_DEFAULT.lng) {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const t = SunCalc.getTimes(d, lat, lng);
  const ok = (x: Date | null | undefined) => (x && !isNaN(x.getTime()) ? x : null);
  return { sunrise: ok(t.sunrise), sunset: ok(t.sunset), dawn: ok(t.dawn), dusk: ok(t.dusk) };
}

export const MOON_EMOJI: Record<MoonPhase, string> = {
  new: "🌑",
  waxing_crescent: "🌒",
  first_quarter: "🌓",
  waxing_gibbous: "🌔",
  full: "🌕",
  waning_gibbous: "🌖",
  last_quarter: "🌗",
  waning_crescent: "🌘",
};

/** Moon phase used for analytics: what the user recorded, else the calculated one. */
export function effectiveMoonPhase(t: { moon_phase: MoonPhase | null; started_at: string }): {
  phase: MoonPhase;
  calculated: boolean;
} {
  if (t.moon_phase) return { phase: t.moon_phase, calculated: false };
  return { phase: moonAt(t.started_at).phase, calculated: true };
}
