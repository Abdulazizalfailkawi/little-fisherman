// Optional environmental data.
//
// Source: Open-Meteo (free, no API key, https://open-meteo.com). What it
// returns is *model output*, never an on-site observation:
//   - future times  -> kind "forecast"
//   - past times    -> kind "model" (forecast-model analysis or ERA5 reanalysis)
// Sun & moon values are astronomical calculations -> kind "calculated".
// Tides: there is no free tide prediction source we can rely on for
// Kuwaiti waters, so tide is manual-entry only. We never fill it in.

import { moonAt, sunTimes } from "./astro";
import { dateKey, todayKey, addDays } from "./time";
import type { EnvKind } from "./types";

export interface EnvReading {
  source: string;
  kind: EnvKind;
  valid_at: string;
  fetched_at: string;
  lat: number;
  lng: number;
  data: Record<string, number | string | null>;
}

function nearestIndex(times: string[], iso: string): number {
  const target = new Date(iso).getTime();
  let best = 0;
  let bd = Infinity;
  times.forEach((t, i) => {
    // Open-Meteo returns times in GMT when timezone=GMT
    const d = Math.abs(new Date(t + "Z").getTime() - target);
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return bd <= 90 * 60_000 ? best : -1;
}

async function getJson(url: string, signal?: AbortSignal) {
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

export async function fetchWeather(lat: number, lng: number, iso: string, signal?: AbortSignal): Promise<EnvReading[]> {
  const day = dateKey(iso);
  const fetched_at = new Date().toISOString();
  const isFuture = new Date(iso).getTime() > Date.now();
  if (day > addDays(todayKey(), 15)) throw new Error("TOO_FAR_AHEAD");
  const old = day < addDays(todayKey(), -80);
  const params = `latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&timezone=GMT&start_date=${addDays(day, -1)}&end_date=${addDays(day, 1)}`;
  const out: EnvReading[] = [];

  const wx = await getJson(
    old
      ? `https://archive-api.open-meteo.com/v1/archive?${params}&hourly=temperature_2m,wind_speed_10m,wind_direction_10m,weather_code`
      : `https://api.open-meteo.com/v1/forecast?${params}&hourly=temperature_2m,wind_speed_10m,wind_direction_10m,weather_code`,
    signal,
  );
  const i = nearestIndex(wx.hourly?.time ?? [], iso);
  if (i >= 0) {
    out.push({
      source: old ? "Open-Meteo · ERA5 reanalysis" : "Open-Meteo · weather model",
      kind: isFuture ? "forecast" : "model",
      valid_at: new Date(wx.hourly.time[i] + "Z").toISOString(),
      fetched_at,
      lat,
      lng,
      data: {
        air_temp_c: wx.hourly.temperature_2m?.[i] ?? null,
        wind_speed_kmh: wx.hourly.wind_speed_10m?.[i] ?? null,
        wind_dir_deg: wx.hourly.wind_direction_10m?.[i] ?? null,
        weather_code: wx.hourly.weather_code?.[i] ?? null,
      },
    });
  }

  if (!old) {
    try {
      const sea = await getJson(
        `https://marine-api.open-meteo.com/v1/marine?${params}&hourly=wave_height,sea_surface_temperature`,
        signal,
      );
      const j = nearestIndex(sea.hourly?.time ?? [], iso);
      const wave = j >= 0 ? sea.hourly.wave_height?.[j] : null;
      const sst = j >= 0 ? sea.hourly.sea_surface_temperature?.[j] : null;
      if (j >= 0 && (wave != null || sst != null)) {
        out.push({
          source: "Open-Meteo · marine model",
          kind: isFuture ? "forecast" : "model",
          valid_at: new Date(sea.hourly.time[j] + "Z").toISOString(),
          fetched_at,
          lat,
          lng,
          data: { wave_height_m: wave ?? null, sea_temp_c: sst ?? null },
        });
      }
    } catch {
      /* marine data is optional; coastal grid cells are often empty */
    }
  }
  return out;
}

export function calculatedAstro(lat: number, lng: number, iso: string): EnvReading {
  const s = sunTimes(iso, lat, lng);
  const m = moonAt(iso);
  return {
    source: "Astronomical calculation (SunCalc)",
    kind: "calculated",
    valid_at: iso,
    fetched_at: new Date().toISOString(),
    lat,
    lng,
    data: {
      sunrise: s.sunrise?.toISOString() ?? null,
      sunset: s.sunset?.toISOString() ?? null,
      moon_phase: m.phase,
      moon_illumination: Math.round(m.illumination * 100),
    },
  };
}

export function degToDir(deg: number | null | undefined): "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW" | null {
  if (deg == null) return null;
  return (["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const)[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
}

const WMO: Record<number, { ar: string; en: string }> = {
  0: { ar: "صافٍ", en: "Clear" },
  1: { ar: "صافٍ غالباً", en: "Mainly clear" },
  2: { ar: "غائم جزئياً", en: "Partly cloudy" },
  3: { ar: "غائم", en: "Overcast" },
  45: { ar: "ضباب", en: "Fog" },
  48: { ar: "ضباب", en: "Fog" },
  51: { ar: "رذاذ", en: "Drizzle" },
  53: { ar: "رذاذ", en: "Drizzle" },
  55: { ar: "رذاذ", en: "Drizzle" },
  61: { ar: "مطر خفيف", en: "Light rain" },
  63: { ar: "مطر", en: "Rain" },
  65: { ar: "مطر غزير", en: "Heavy rain" },
  80: { ar: "زخات", en: "Showers" },
  81: { ar: "زخات", en: "Showers" },
  82: { ar: "زخات قوية", en: "Heavy showers" },
  95: { ar: "عاصفة رعدية", en: "Thunderstorm" },
};
export function weatherLabel(code: number | string | null | undefined, lang: "ar" | "en"): string {
  if (code == null) return "—";
  return WMO[Number(code)]?.[lang] ?? `WMO ${code}`;
}
