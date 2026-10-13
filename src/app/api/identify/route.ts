// POST /api/identify — AI fish identification (server-side only).
//
// The Anthropic key never leaves the server. Requests must carry the
// signed-in user's Supabase access token so the endpoint can't be used
// anonymously to spend API credit. The model only *suggests*; the client
// always asks the user to confirm or correct before anything is saved.

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

const RequestSchema = z.object({
  image: z
    .string()
    .min(100)
    .max(4_000_000)
    .regex(/^[A-Za-z0-9+/=]+$/, "image must be base64"),
  lang: z.enum(["ar", "en"]).default("ar"),
  species: z
    .array(
      z.object({
        id: z.string().uuid(),
        name_ar: z.string().max(80),
        name_en: z.string().max(120).nullable(),
        scientific_name: z.string().max(120).nullable(),
      }),
    )
    .max(500),
  context: z
    .object({
      location: z.string().max(100).optional(),
      technique: z.string().max(60).optional(),
      depth_m: z.number().optional(),
    })
    .optional(),
});

const OutputSchema = z.object({
  image_quality: z.enum(["good", "fair", "poor", "not_a_fish"]),
  summary: z.string(),
  candidates: z
    .array(
      z.object({
        name_ar: z.string(),
        name_en: z.string(),
        scientific_name: z.string(),
        confidence: z.number(),
        matched_species_id: z.string(),
        reasoning: z.string(),
      }),
    )
    .max(5),
});

const JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["image_quality", "summary", "candidates"],
  properties: {
    image_quality: { type: "string", enum: ["good", "fair", "poor", "not_a_fish"] },
    summary: { type: "string" },
    candidates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name_ar", "name_en", "scientific_name", "confidence", "matched_species_id", "reasoning"],
        properties: {
          name_ar: { type: "string" },
          name_en: { type: "string" },
          scientific_name: { type: "string" },
          confidence: { type: "number" },
          matched_species_id: { type: "string" },
          reasoning: { type: "string" },
        },
      },
    },
  },
};

const SYSTEM = `You help a recreational fisherman in Kuwait (Arabian Gulf) identify fish from photos.
Rules:
- Suggest at most 3 candidate species, most likely first. Use Kuwaiti/Gulf Arabic common names when you know them.
- Confidence is a calibrated probability between 0 and 1. Never give 1.0. Photos rarely justify more than 0.9.
- If the photo is blurry, partial, badly lit, or several species look alike, lower the confidence, list the alternatives, and say what would help (e.g. a side view showing fins and markings).
- scientific_name: give it only when you are confident about the species; otherwise return an empty string.
- matched_species_id: if a candidate is the same species as an entry in the user's species list, return that entry's id; otherwise an empty string. Only match when it is genuinely the same species, not just the same family.
- If the image does not show a fish, set image_quality to "not_a_fish" and return no candidates.
- Write "summary" and each "reasoning" in the requested language, briefly (1–2 sentences).`;

function json(status: number, body: unknown) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

async function authorize(req: Request): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return process.env.AI_ALLOW_ANONYMOUS === "true" ? null : "AUTH_NOT_CONFIGURED";
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return "UNAUTHENTICATED";
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) return "UNAUTHENTICATED";
  // AI identification is limited to the admin account.
  const admin = (process.env.ADMIN_EMAIL || "alfailkaw33@gmail.com").toLowerCase();
  if ((data.user.email ?? "").toLowerCase() !== admin) return "FORBIDDEN";
  return null;
}

export async function GET() {
  return json(200, { configured: Boolean(process.env.ANTHROPIC_API_KEY), model: MODEL });
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) return json(503, { error: "AI_NOT_CONFIGURED" });

  const authError = await authorize(req);
  if (authError) return json(authError === "FORBIDDEN" ? 403 : 401, { error: authError });

  let body: z.infer<typeof RequestSchema>;
  try {
    body = RequestSchema.parse(await req.json());
  } catch (e) {
    return json(400, { error: "BAD_REQUEST", detail: e instanceof z.ZodError ? e.issues.slice(0, 3) : String(e) });
  }

  const speciesList = body.species
    .map((s) => `${s.id} | ${s.name_ar} | ${s.name_en ?? ""} | ${s.scientific_name ?? ""}`)
    .join("\n");
  const ctx = body.context
    ? Object.entries(body.context)
        .filter(([, v]) => v != null && v !== "")
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ")
    : "";

  const client = new Anthropic();
  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: { type: "json_schema", schema: JSON_SCHEMA } },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: body.image } },
            {
              type: "text",
              text: `Answer language: ${body.lang === "ar" ? "Arabic" : "English"}.
${ctx ? `Catch context (may help, may be wrong): ${ctx}\n` : ""}The user's species list (id | Arabic | English | scientific):
${speciesList || "(empty)"}

Identify the fish in the photo.`,
            },
          ],
        },
      ],
    });

    if (response.stop_reason === "refusal") return json(422, { error: "AI_REFUSED" });
    if (response.stop_reason === "max_tokens") return json(502, { error: "AI_TRUNCATED" });

    const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    const parsed = OutputSchema.safeParse(JSON.parse(text));
    if (!parsed.success) return json(502, { error: "AI_BAD_OUTPUT" });

    const validIds = new Set(body.species.map((s) => s.id));
    const candidates = parsed.data.candidates.slice(0, 3).map((c) => ({
      name_ar: c.name_ar.trim(),
      name_en: c.name_en.trim(),
      scientific_name: c.scientific_name.trim() || null,
      // Never present certainty, whatever the model says.
      confidence: Math.max(0, Math.min(0.95, c.confidence)),
      matched_species_id: validIds.has(c.matched_species_id) ? c.matched_species_id : null,
      reasoning: c.reasoning.trim(),
    }));

    return json(200, {
      model: response.model,
      created_at: new Date().toISOString(),
      image_quality: parsed.data.image_quality,
      summary: parsed.data.summary.trim(),
      candidates,
    });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json(429, { error: "AI_RATE_LIMITED" });
    if (e instanceof Anthropic.AuthenticationError) return json(503, { error: "AI_KEY_INVALID" });
    if (e instanceof Anthropic.BadRequestError) return json(502, { error: "AI_BAD_REQUEST", detail: e.message });
    if (e instanceof Anthropic.APIConnectionError) return json(504, { error: "AI_UNREACHABLE" });
    if (e instanceof Anthropic.APIError) return json(502, { error: "AI_ERROR", detail: e.message });
    return json(500, { error: "SERVER_ERROR" });
  }
}
