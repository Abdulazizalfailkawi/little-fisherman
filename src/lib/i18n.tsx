"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { EquipmentCategory, GoalKind, MoonPhase, SeaState, Tide, WindDir } from "./types";

export type Lang = "ar" | "en";

interface I18n {
  lang: Lang;
  dir: "rtl" | "ltr";
  setLang: (l: Lang) => void;
  /** Inline bilingual string: t("عربي", "English") */
  t: (ar: string, en: string) => string;
  /** Pick a localised name from a record with name_ar / name_en. */
  name: (r: { name_ar: string; name_en?: string | null } | null | undefined) => string;
  num: (n: number | null | undefined, digits?: number) => string;
}

const Ctx = createContext<I18n | null>(null);
const KEY = "ft.lang";

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("ar");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved === "en" || saved === "ar") setLangState(saved);
    } catch {}
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(KEY, l);
    } catch {}
  }, []);

  const value = useMemo<I18n>(
    () => ({
      lang,
      dir: lang === "ar" ? "rtl" : "ltr",
      setLang,
      t: (ar, en) => (lang === "ar" ? ar : en),
      name: (r) => {
        if (!r) return lang === "ar" ? "غير محدد" : "Unidentified";
        return lang === "ar" ? r.name_ar : r.name_en || r.name_ar;
      },
      num: (n, digits = 1) => {
        if (n == null || Number.isNaN(n)) return "—";
        const r = Math.round(n * 10 ** digits) / 10 ** digits;
        return r.toLocaleString(lang === "ar" ? "ar-KW-u-nu-latn" : "en-US", { maximumFractionDigits: digits });
      },
    }),
    [lang, setLang],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const v = useContext(Ctx);
  if (!v) throw new Error("useI18n outside provider");
  return v;
}

// ---------------------------------------------------------------------------
// Enum labels
// ---------------------------------------------------------------------------
type L = { ar: string; en: string };

export const TIDE_LABEL: Record<Tide, L> = {
  high: { ar: "وقفة أعلى المد", en: "High-water slack" },
  rising: { ar: "سجي", en: "Rising (Saji)" },
  falling: { ar: "ثبر", en: "Falling (Thabr)" },
  low: { ar: "وقفة أدنى الجزر", en: "Low-water slack" },
};

export const MOON_LABEL: Record<MoonPhase, L> = {
  new: { ar: "محاق", en: "New moon" },
  waxing_crescent: { ar: "هلال متزايد", en: "Waxing crescent" },
  first_quarter: { ar: "تربيع أول", en: "First quarter" },
  waxing_gibbous: { ar: "أحدب متزايد", en: "Waxing gibbous" },
  full: { ar: "بدر", en: "Full moon" },
  waning_gibbous: { ar: "أحدب متناقص", en: "Waning gibbous" },
  last_quarter: { ar: "تربيع أخير", en: "Last quarter" },
  waning_crescent: { ar: "هلال متناقص", en: "Waning crescent" },
};

export const SEA_LABEL: Record<SeaState, L> = {
  calm: { ar: "هادئ", en: "Calm" },
  slight: { ar: "خفيف", en: "Slight" },
  moderate: { ar: "متوسط", en: "Moderate" },
  rough: { ar: "مضطرب", en: "Rough" },
  very_rough: { ar: "مضطرب جداً", en: "Very rough" },
};

export const WIND_LABEL: Record<WindDir, L> = {
  N: { ar: "شمال", en: "N" },
  NE: { ar: "شمال شرق", en: "NE" },
  E: { ar: "شرق", en: "E" },
  SE: { ar: "جنوب شرق (كوس)", en: "SE" },
  S: { ar: "جنوب", en: "S" },
  SW: { ar: "جنوب غرب", en: "SW" },
  W: { ar: "غرب", en: "W" },
  NW: { ar: "شمال غرب", en: "NW" },
};

export const EQUIP_LABEL: Record<EquipmentCategory, L> = {
  rod: { ar: "سنارة / عصا", en: "Rod" },
  reel: { ar: "مكينة (ريل)", en: "Reel" },
  line: { ar: "خيط", en: "Line" },
  leader: { ar: "ليدر", en: "Leader" },
  lure: { ar: "طُعم صناعي", en: "Lure" },
  jig: { ar: "جك", en: "Jig" },
  hook: { ar: "ميدار / خطاف", en: "Hook" },
  bait: { ar: "طُعم طبيعي", en: "Bait" },
  accessory: { ar: "إكسسوارات", en: "Accessory" },
};

export const GOAL_LABEL: Record<GoalKind, L> = {
  species_count: { ar: "صيد عدد من نوع محدد", en: "Catch N of a species" },
  distinct_species: { ar: "عدد أنواع مختلفة", en: "Number of different species" },
  trip_count: { ar: "عدد رحلات", en: "Number of trips" },
  catch_count: { ar: "إجمالي عدد الأسماك", en: "Total fish caught" },
  fish_over_weight: { ar: "سمكة أثقل من (كغ)", en: "A fish heavier than (kg)" },
  fish_over_length: { ar: "سمكة أطول من (سم)", en: "A fish longer than (cm)" },
  technique_success_rate: { ar: "نسبة نجاح طريقة (%)", en: "Technique success rate (%)" },
  species_with_technique: { ar: "نوع محدد بطريقة محددة", en: "Species with a specific technique" },
};

export function label<T extends string>(map: Record<T, L>, key: T | null | undefined, lang: Lang): string {
  if (!key) return "—";
  return map[key]?.[lang] ?? key;
}
