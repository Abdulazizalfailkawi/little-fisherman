// push-tick: called every 5 minutes by pg_cron. For every spot somebody follows, it
// computes the tide turning points (same method as the app: parabola-refined
// extrema of Open-Meteo's sea-level model, waqfa = |rate| < 5 cm/h, capped at
// 90 min) and pushes "the water has stopped at <spot>" once per waqfa.
// Protected by a shared secret kept in push_config.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

interface Pt { t: number; h: number }
interface Ext { t: number; h: number; type: "high" | "low" }
interface Turn { t: number; type: "high" | "low"; start: number | null; end: number | null }

const H = 3_600_000;
const RATE = 0.05;
const MAX_HALF_MIN = 90;
const MAX_GAP = 90 * 60_000;

function findExtrema(pts: Pt[], minRange = 0.15): Ext[] {
  const raw: Ext[] = [];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], b = pts[i], c = pts[i + 1];
    if (b.t - a.t > MAX_GAP || c.t - b.t > MAX_GAP) continue;
    const isHigh = b.h >= a.h && b.h > c.h;
    const isLow = b.h <= a.h && b.h < c.h;
    if (!isHigh && !isLow) continue;
    const denom = a.h - 2 * b.h + c.h;
    const dt = (c.t - a.t) / 2;
    let off = denom !== 0 ? (0.5 * (a.h - c.h)) / denom : 0;
    off = Math.max(-0.5, Math.min(0.5, off));
    raw.push({ t: Math.round(b.t + off * dt), h: b.h - 0.25 * (a.h - c.h) * off, type: isHigh ? "high" : "low" });
  }
  const alt: Ext[] = [];
  for (const e of raw) {
    const last = alt[alt.length - 1];
    if (last && last.type === e.type) {
      if ((e.type === "high" && e.h > last.h) || (e.type === "low" && e.h < last.h)) alt[alt.length - 1] = e;
    } else alt.push(e);
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < alt.length - 1; i++) {
      if (Math.abs(alt[i].h - alt[i + 1].h) < minRange) {
        alt.splice(i, 2);
        for (let j = Math.max(0, i - 1); j < alt.length - 1; j++) {
          if (alt[j].type === alt[j + 1].type) {
            const keep = alt[j].type === "high" ? (alt[j].h >= alt[j + 1].h ? alt[j] : alt[j + 1]) : alt[j].h <= alt[j + 1].h ? alt[j] : alt[j + 1];
            alt.splice(j, 2, keep);
            j--;
          }
        }
        changed = true;
        break;
      }
    }
  }
  return alt;
}

function turningPoints(pts: Pt[], ext: Ext[]): Turn[] {
  const out: Turn[] = [];
  for (const e of ext) {
    let i = 0;
    for (let k = 1; k < pts.length; k++) if (Math.abs(pts[k].t - e.t) < Math.abs(pts[i].t - e.t)) i = k;
    if (i === 0 || i === pts.length - 1) {
      out.push({ t: e.t, type: e.type, start: null, end: null });
      continue;
    }
    const dtH = (pts[i + 1].t - pts[i - 1].t) / 2 / H;
    const a = Math.abs((pts[i - 1].h - 2 * pts[i].h + pts[i + 1].h) / (dtH * dtH));
    let halfMin = a > 0 ? (RATE / a) * 60 : Infinity;
    halfMin = Math.min(halfMin, MAX_HALF_MIN);
    out.push({ t: e.t, type: e.type, start: e.t - halfMin * 60_000, end: e.t + halfMin * 60_000 });
  }
  return out;
}

async function turnsFor(lat: number, lng: number): Promise<Turn[]> {
  const q = new URLSearchParams({
    latitude: lat.toFixed(2),
    longitude: lng.toFixed(2),
    hourly: "sea_level_height_msl",
    timezone: "GMT",
    past_days: "1",
    forecast_days: "3",
    cell_selection: "sea",
  });
  const r = await fetch(`https://marine-api.open-meteo.com/v1/marine?${q}`);
  if (!r.ok) return [];
  const j = await r.json();
  const times: string[] = j?.hourly?.time ?? [];
  const vals: (number | null)[] = j?.hourly?.sea_level_height_msl ?? [];
  const pts: Pt[] = times
    .map((t, i) => ({ t: Date.parse(t + "Z"), h: vals[i] as number }))
    .filter((p) => Number.isFinite(p.t) && typeof p.h === "number" && Number.isFinite(p.h));
  if (pts.length < 3) return [];
  return turningPoints(pts, findExtrema(pts));
}

Deno.serve(async (req) => {
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: cfg } = await sb.from("push_config").select("*").eq("id", 1).maybeSingle();
  if (!cfg) return new Response("no config", { status: 503 });
  if (req.headers.get("x-cron-secret") !== cfg.cron_secret) return new Response("forbidden", { status: 403 });
  webpush.setVapidDetails(cfg.subject, cfg.vapid_public, cfg.vapid_private);

  // test hook: ?force=1 sends the next waqfa message for each followed spot right away
  const force = new URL(req.url).searchParams.get("force") === "1";

  const { data: subs } = await sb.from("push_subs").select("*");
  const cache = new Map<string, Turn[]>();
  const now = Date.now();
  let sent = 0, removed = 0, checked = 0;

  for (const sub of subs ?? []) {
    const sentIds: string[] = Array.isArray(sub.sent) ? sub.sent : [];
    const fresh: string[] = [];
    for (const spot of (sub.spots ?? []) as { name: string; lat: number; lng: number }[]) {
      const key = `${spot.lat.toFixed(2)},${spot.lng.toFixed(2)}`;
      if (!cache.has(key)) cache.set(key, await turnsFor(spot.lat, spot.lng).catch(() => []));
      const turns = cache.get(key)!;
      checked++;
      // the waqfa has started (or starts within 2 min) and still has >= 5 min left
      let turn = turns.find((x) => x.start != null && x.end != null && now >= x.start - 2 * 60_000 && now <= x.end - 5 * 60_000);
      if (!turn && force) turn = turns.find((x) => x.start != null && x.end != null && x.t > now) ?? undefined;
      if (!turn) continue;
      const id = `${key}:${turn.t}`;
      if (!force && sentIds.includes(id)) continue;
      const mins = Math.max(1, Math.round(((turn.end as number) - (turn.start as number)) / 60_000));
      const ar = sub.lang !== "en";
      const kind = turn.type === "high" ? (ar ? "أعلى المد" : "high tide") : ar ? "أدنى الجزر" : "low tide";
      const payload = JSON.stringify(
        ar
          ? { title: `وقفت المية — ${spot.name}`, body: `بدأت وقفة ${kind} تقريباً، وتستمر حوالي ${mins} دقيقة. (تقدير من نموذج وقد يختلف عن الرسمي)`, tag: id, url: "/" }
          : { title: `The water has stopped — ${spot.name}`, body: `The ${kind} slack is starting, lasting about ${mins} min. (Model estimate — may differ from official)`, tag: id, url: "/" },
      );
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, { TTL: 900, urgency: "high" });
        fresh.push(id);
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) {
          await sb.from("push_subs").delete().eq("id", sub.id);
          removed++;
          break;
        }
      }
    }
    if (fresh.length) await sb.from("push_subs").update({ sent: [...sentIds, ...fresh].slice(-30) }).eq("id", sub.id);
  }
  return Response.json({ subs: subs?.length ?? 0, checked, sent, removed });
});
