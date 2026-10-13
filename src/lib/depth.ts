// Depths are stored in metres (the `*_m` columns); the user sees and types
// them in feet by default. The choice is a per-device display preference.

import { useEffect, useState } from "react";

export type DepthUnit = "ft" | "m";
export const FT_PER_M = 3.28084;
const KEY = "ft.depthUnit";

export function readDepthUnit(): DepthUnit {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "m" || v === "ft") return v;
  } catch {}
  return "ft";
}

export function saveDepthUnit(u: DepthUnit) {
  try {
    localStorage.setItem(KEY, u);
  } catch {}
  if (typeof window !== "undefined") window.dispatchEvent(new Event("ft:units"));
}

/** Current depth unit, kept in sync when it is changed anywhere in the app. */
export function useDepthUnit(): DepthUnit {
  const [u, setU] = useState<DepthUnit>("ft");
  useEffect(() => {
    const sync = () => setU(readDepthUnit());
    sync();
    window.addEventListener("ft:units", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("ft:units", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return u;
}

/** Metres → display unit (one decimal at most). */
export function toUnit(m: number | null | undefined, u: DepthUnit): number | null {
  if (m == null || !Number.isFinite(m)) return null;
  return u === "ft" ? Math.round(m * FT_PER_M * 10) / 10 : m;
}

/** Display unit → metres, as stored. */
export function fromUnit(v: number | null | undefined, u: DepthUnit): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  return u === "ft" ? Math.round((v / FT_PER_M) * 1000) / 1000 : v;
}

export function depthWord(u: DepthUnit, lang: "ar" | "en"): string {
  return u === "ft" ? (lang === "ar" ? "قدم" : "ft") : lang === "ar" ? "م" : "m";
}

export function fmtDepth(m: number | null | undefined, u: DepthUnit, lang: "ar" | "en"): string {
  const v = toUnit(m, u);
  return v == null ? "—" : `${v} ${depthWord(u, lang)}`;
}

/** "60–90 قدم" or "60 قدم" when the range is a single value. */
export function fmtDepthRange(lo: number | null | undefined, hi: number | null | undefined, u: DepthUnit, lang: "ar" | "en"): string {
  const a = toUnit(lo, u);
  if (a == null) return "—";
  const b = toUnit(hi ?? lo, u);
  return `${b == null || b === a ? a : `${a}–${b}`} ${depthWord(u, lang)}`;
}
