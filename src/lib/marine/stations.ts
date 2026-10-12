// Tide reference choices for a fishing spot.
// The Kuwait Meteorological Center publishes official tide tables for two
// ports (Shuwaikh, Shuaiba) on met.gov.kw without an API; those can only be
// copied in manually. "model" uses the Open-Meteo sea-level model at the
// spot's coordinates (or WorldTides when configured on the server).

export const TIDE_STATIONS = [
  { id: "model", ar: "تلقائي — نموذج مستوى البحر عند الموقع", en: "Automatic — sea-level model at the spot" },
  { id: "shuwaikh", ar: "الشويخ (جدول رسمي — إدخال يدوي)", en: "Shuwaikh (official table — manual entry)" },
  { id: "shuaiba", ar: "الشعيبة (جدول رسمي — إدخال يدوي)", en: "Shuaiba (official table — manual entry)" },
] as const;

export const KMC_MARINE_URL = "https://met.gov.kw/Forecasts/marine.php";

/** Approximate centre of the Al-Fintas coastal area — only used to centre the map, never as a fishing spot. */
export const FINTAS_AREA = { lat: 29.17, lng: 48.12, zoom: 13 };
