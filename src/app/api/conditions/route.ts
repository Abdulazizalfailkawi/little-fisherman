// GET /api/conditions?lat=&lng=&from=&to=[&tide=auto|model|worldtides]
//
// Server-side aggregation of weather, marine and tide data for one location
// and time window. Coordinates are rounded to 0.01° (~1 km) before they leave
// the server, which also makes responses cacheable (Next data cache + CDN).

import { z } from "zod";
import { ATTRIBUTION, fetchMarine, fetchWeather, tideFromMarine, tideFromWorldTides } from "@/lib/marine/providers";
import type { Conditions } from "@/lib/marine/types";

export const runtime = "nodejs";
export const maxDuration = 30;

const Q = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  from: z.string().datetime({ offset: true }),
  to: z.string().datetime({ offset: true }),
  tide: z.enum(["auto", "model", "worldtides"]).default("auto"),
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = Q.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return Response.json({ error: "BAD_REQUEST", detail: parsed.error.issues.slice(0, 3) }, { status: 400 });
  const p = parsed.data;
  const now = Date.now();
  const hour = 3_600_000;
  // Snap to whole hours so identical requests share the cache.
  const from = Math.floor(Date.parse(p.from) / hour) * hour;
  const to = Math.ceil(Date.parse(p.to) / hour) * hour;
  if (!(to > from) || to - from > 8 * 86_400_000) return Response.json({ error: "WINDOW_TOO_LARGE" }, { status: 400 });
  if (from > now + 16 * 86_400_000) return Response.json({ error: "TOO_FAR_AHEAD" }, { status: 422 });

  const lat = Math.round(p.lat * 100) / 100;
  const lng = Math.round(p.lng * 100) / 100;
  const w = { lat, lng, from, to, wantCurrent: from <= now && to >= now - hour };

  const [wx, marine] = await Promise.all([fetchWeather(w, now), fetchMarine(w, now)]);
  const key = process.env.WORLDTIDES_API_KEY;
  let tide = tideFromMarine(marine);
  if (key && p.tide !== "model") {
    const wt = await tideFromWorldTides(w, key);
    if (wt.status === "ok" || p.tide === "worldtides") tide = wt;
  }

  const body: Conditions = {
    request: { lat, lng, from: new Date(from).toISOString(), to: new Date(to).toISOString() },
    fetched_at: new Date(now).toISOString(),
    weather: wx.block,
    current: wx.current,
    daily: wx.daily,
    marine,
    tide,
    attribution: ATTRIBUTION,
  };
  const past = to < now - 2 * 86_400_000;
  return Response.json(body, {
    headers: {
      "Cache-Control": past ? "public, s-maxage=86400, stale-while-revalidate=604800" : "public, s-maxage=900, stale-while-revalidate=1800",
    },
  });
}
