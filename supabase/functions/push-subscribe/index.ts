// Public endpoint used by the app to register / update / remove a push subscription.
// No account is needed (people can use the app without one), so the input is
// validated strictly and only the fields below are stored. Service role writes.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const isStr = (v: unknown, max: number): v is string => typeof v === "string" && v.length > 0 && v.length <= max;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json(405, { error: "METHOD" });
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "BAD_JSON" });
  }
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const endpoint = body?.subscription?.endpoint;
  if (!isStr(endpoint, 1000) || !/^https:\/\//.test(endpoint)) return json(400, { error: "BAD_ENDPOINT" });

  if (body.unsubscribe === true) {
    await sb.from("push_subs").delete().eq("endpoint", endpoint);
    return json(200, { ok: true });
  }

  const p256dh = body.subscription?.keys?.p256dh;
  const auth = body.subscription?.keys?.auth;
  if (!isStr(p256dh, 200) || !isStr(auth, 100)) return json(400, { error: "BAD_KEYS" });
  const spots = (Array.isArray(body.spots) ? body.spots : [])
    .slice(0, 6)
    .map((s: any) => ({ name: String(s?.name ?? "").slice(0, 60), lat: Number(s?.lat), lng: Number(s?.lng) }))
    .filter((s: any) => s.name && Number.isFinite(s.lat) && Number.isFinite(s.lng) && Math.abs(s.lat) <= 90 && Math.abs(s.lng) <= 180);
  const lang = body.lang === "en" ? "en" : "ar";

  const { error } = await sb
    .from("push_subs")
    .upsert({ endpoint, p256dh, auth, spots, lang, updated_at: new Date().toISOString() }, { onConflict: "endpoint" });
  if (error) return json(500, { error: "DB" });
  return json(200, { ok: true, spots: spots.length });
});
