// The four main fishing areas offered in the sea section. Coordinates were
// supplied by the user in degrees/minutes/seconds and are converted here.

import { normalizeName } from "../normalize";

function dms(d: number, m: number, s: number): number {
  return Math.round((d + m / 60 + s / 3600) * 1e5) / 1e5;
}

export interface PresetSpot {
  name: string;
  name_en: string;
  lat: number;
  lng: number;
}

export const PRESET_SPOTS: PresetSpot[] = [
  { name: "جون الكويت", name_en: "Kuwait Bay", lat: dms(29, 23, 43.5), lng: dms(47, 56, 54.2) },
  { name: "الفنطاس", name_en: "Al-Fintas", lat: dms(29, 10, 19.2), lng: dms(48, 7, 50.2) },
  { name: "أبراج الكويت", name_en: "Kuwait Towers", lat: dms(29, 22, 22.6), lng: dms(48, 2, 14.1) },
  { name: "الخيران", name_en: "Al-Khiran", lat: dms(28, 40, 50.2), lng: dms(48, 23, 26.6) },
];

/** Position of a spot in the fixed preset order, or -1 for user-added spots. */
export function presetRank(name: string): number {
  const n = normalizeName(name);
  return PRESET_SPOTS.findIndex((p) => normalizeName(p.name) === n);
}
