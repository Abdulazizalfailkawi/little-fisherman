# الصياد الصغير · Little Fisherman

Personal fishing journal for Kuwait — trips, catches, AI fish ID, a species
collection, Hijri + Gregorian calendar, analytics, records, achievements,
goals, gear, offline drafts and backups. Arabic (RTL) first, English option.
Mobile-first PWA for iPhone Safari.

---

## Stack (and why)

| Layer | Choice | Why |
|---|---|---|
| App | **Next.js 16 + TypeScript**, App Router | One codebase for UI + a small server route for the AI key |
| UI | **Tailwind CSS v4** + own component set (`src/components/ui.tsx`), lucide icons | Small, consistent design system; no heavy UI kit needed |
| Data | **Supabase** (Postgres + Auth + Storage) with **Row Level Security** | Real relational DB, private per-user data, photo storage, free tier |
| Offline | **IndexedDB** (local-first store) + **outbox sync** + **service worker** | Works on a boat with no signal; syncs safely later |
| Charts | **Recharts** | Simple, reliable bar charts |
| Hijri | Browser **Intl `islamic-umalqura`** calendar + manual corrections | No extra library; Umm al-Qura is the standard tabular Hijri calendar |
| Sun / moon | **SunCalc** (astronomical calculation) | Deterministic, no API |
| Weather / sea | **Open-Meteo** (free, no key) | Forecast / model data with source + timestamp |
| Fish ID | **Claude** via `@anthropic-ai/sdk` on the server (`/api/identify`) | Vision model; key stays on the server; swappable |

### Architecture in one paragraph
The browser keeps a full copy of *your* data in IndexedDB. Every change is
written locally first, then appended to an **outbox** that is pushed to
Supabase in order. All primary keys are UUIDs created on the device, so a
retried upload is an *upsert* and can never create a duplicate. After pushing,
the app pulls the server copy and re-applies anything still pending. All
statistics are computed in the browser from the saved records
(`src/lib/stats.ts`), never hard-coded.

---

## Feature status

| Area | Status |
|---|---|
| Dashboard (totals, success rate, hours, top species, biggest fish, favourite technique, weekly streak, recent trips, goals, month/year summaries) | ✅ Working |
| Trips: create / draft (in progress) / finish / edit / delete, zero-catch trips counted | ✅ Working |
| Catches: photo, species, time, weight/length (measured vs estimated), kept/released, gear, depth, tide, notes; edit/delete | ✅ Working |
| Photo upload: resize to 1600 px + 400 px thumbnail, SHA-256 de-duplication | ✅ Working |
| Trip photos & short videos (≤ 25 MB) | ✅ Working |
| Species database (16 Gulf species seeded, editable, aliases, Arabic spelling normalisation, merge duplicates) | ✅ Working |
| My Fish Collection + per-species page (counts, first/last, records, averages from measured values, spots, techniques, best hours with sample size, history) | ✅ Working |
| Hijri / Gregorian calendar (both views, markers for successful vs blank days, fish count, day detail, filters, month + year summaries, global offset, per-trip correction) | ✅ Working |
| Analytics (weekday, hour normalised by time fished, month, technique, spot, moon, tide, sea state, species, species×technique, depth by species, gear) with sample sizes and "insufficient data" flags | ✅ Working |
| Personal records (measured vs estimated clearly separated) | ✅ Working |
| Achievements (13, auto-unlocked from data) + custom goals (8 types) | ✅ Working |
| Equipment inventory with photos, linked to trips/catches, performance table | ✅ Working |
| Search, filters, timeline, photo gallery | ✅ Working |
| CSV export (trips, catches, statistics), JSON backup & restore, printable report | ✅ Working |
| Offline app shell, offline trips/catches/photos, automatic sync, unsynced markers | ✅ Working (tested in Chrome with the network switched off) |
| Weather / sea data (Open-Meteo) with source, model/forecast label, timestamp | ✅ Working |
| Sunrise/sunset + moon phase & illumination | ✅ Working (calculated) |
| **AI fish identification** | ⚠️ **Needs `ANTHROPIC_API_KEY`.** Code path is complete; it has **not yet been run against the live API** because no key was configured during development. Until a key is added the button says “AI not configured” and manual selection works. |
| Tide | ✅ Modelled tide (Open-Meteo sea level) with next high/low, phase and 24 h chart, clearly labelled as a model; manual entry of official KMC times; optional WorldTides (untested) |
| Live on-site observations (buoys etc.) | ❌ Not available — external data is always labelled forecast/model. |

---

## v3 — three sections, سجي / ثبر / الوقفة, trip lifecycle

**Navigation (exactly three):** البحر (`/`, marine dashboard) · رحلاتي وصيدي (`/trips` + tabs: catches, calendar, spots, gear, photos) · إحصائياتي (`/stats` + tabs: species, analytics, records, reports, goals, settings). Old routes (`/marine`, `/quick`, `/more`) redirect.

**Tide terms:** سجي = rising, ثبر = falling, الوقفة = approximate slack period around a turning point.

**Waqfa method (`src/lib/marine/waqfa.ts`):** turning point = extremum of the predicted sea-level series (parabolic refinement); curvature *a* from the second difference; waqfa = interval where |rate| < 5 cm/h, i.e. ±(0.05/|a|) h, capped at 90 min (flagged “flat” for weak tides). Turning-time uncertainty ±30 min for hourly data. With event times only (manual official table) the event time is shown and **no waqfa duration is invented**. The countdown re-targets automatically when a turning point passes and refetches when the loaded window runs out.

**Tide chart:** custom SVG, monotone-cubic interpolation through the provider’s hourly values (no overshoot; in-between values are estimates), teal = سجي, coral = ثبر, shaded estimated waqfa, “now” line, tap/drag readout.

**Trips:** planned → active → completed (cancelled possible); one active trip at a time; several target species per trip (`trip_targets`); target depth or range; lure/jig type, weight, colour, size; trolling speed; completion summary with “what worked / next time”. Catches can exist without a trip and be linked later; a catch during an active trip is linked automatically and prefilled from the plan (all fields editable).

**Statistics:** completed trips only. Target success per species = completed trips with S as a target on which ≥1 S was caught; multi-target trips counted per target. Depth uses actual catch depth only (missing ≠ 0); lure stats show usage where recorded; tide/waqfa comparisons use each catch’s own snapshot.

**Migration:** `supabase/migrations/20261013000004_trip_lifecycle_targets.sql` (additive; `draft` kept as legacy alias of `active`).

## Marine intelligence (v2)

### What was investigated for Kuwait (Oct 2026)

| Source | Result | How it is used |
|---|---|---|
| **Kuwait Meteorological Center** — met.gov.kw/Forecasts/marine.php | Official tide tables for **Shuwaikh** and **Shuaiba**, wave/wind bulletin. **No API**, and the site terms forbid republishing without written approval. | Not scraped. Linked from the app; you can type the official high/low times in as **manual** entries (marked “manual”). |
| **Open-Meteo Weather** (forecast, Historical Forecast API 2022+, ERA5 archive 1940+) | Verified for Kuwait. Free, non-commercial, CC BY 4.0. | Current/hourly/daily weather, wind, gusts, humidity, cloud, rain probability; historical conditions for past catches (labelled *historical model* or *reanalysis*). |
| **Open-Meteo Marine** | Verified non-null for Kuwait Bay, Al-Fintas, Kubbar, Qaruh: waves, wind-waves, swell, SST, currents, `sea_level_height_msl`. Grid ~5–9 km; the Al-Fintas query snaps to a sea cell ~15 km offshore (29.21, 48.29). History back to at least 2023 for waves/sea level; **2019 returned nothing** (shown as unavailable). | Waves/swell/SST/currents, and a **modelled** tide series. |
| `sea_level_height_msl` as tide | Produces a realistic mixed semidiurnal curve (≈2–3 m range in Kuwait Bay), but Open-Meteo documents it as *“not suitable for coastal navigation”*, MSL datum. | High/low tides = local extrema of that series; rising/falling from successive values. Always labelled **model — not an official tide table**. |
| **WorldTides API** (paid credits) | Station/atlas tide predictions. | Optional, used when `WORLDTIDES_API_KEY` is set. **Not tested** (no key). |

### Data-type labels used everywhere
`forecast` · `historical model` (archived model run for a past time) · `reanalysis` (ERA5) · `model` (sea-level model) · `calculated` (sun/moon, SunCalc) · `manual` · `unavailable`. Nothing is shown as an observation, because no integrated source provides on-site observations.

### How snapshots work
* Every trip start (or planned trip) and every catch gets an **environmental snapshot** fetched for **its own time and coordinates** (catch GPS → catch spot → trip GPS → trip spot) via the server route `/api/conditions` (coordinates rounded to ~1 km; responses cached).
* Snapshots are **append-only** with source, data type, provider valid time and retrieval time. Re-fetching adds a new snapshot; nothing is overwritten. Manual corrections are stored separately and take priority.
* A catch saved offline gets its snapshot automatically when the device is back online.
* For an old catch the app requests that date (historical model / reanalysis) — it never uses today's weather. If nothing exists for that time, it stores and shows “Historical data unavailable”.

### New pages
`/marine` (Marine dashboard) · `/catches` (catch history) · `/reports` (weekly/monthly/yearly/custom, demo excluded) · `/spot?id=` (spot detail with map) · species pages now include **target-trip analytics** (Balool etc.) with explicit denominators and missing-data counts.

### Known limitations
* No official Kuwaiti tide data can be integrated automatically; the modelled tide may differ from the official Shuwaikh/Shuaiba tables, especially near the coast and inside Kuwait Bay.
* Marine model cells are coarse; very nearshore/shore spots get the nearest sea cell.
* Hazard notices (strong wind ≥ 20 kn / gusts ≥ 27 kn, waves ≥ 1.5 m, thunderstorms) are simple flags, **not a safety model** — always check the official marine bulletin.
* Optional LLM-written summaries were not added; the summary engine is template-based and works without any paid API.

## 1. Install & run locally

Requirements: Node.js 20+ (tested on 24).

```bash
npm install
cp .env.example .env.local   # then fill in the values (see below)
npm run dev                  # http://localhost:3000
```

Other scripts:

```bash
npm run build && npm start   # production build (service worker only runs here)
npm test                     # unit tests (stats, Hijri, achievements, goals, sync, backup)
npm run typecheck
```

Without Supabase variables the app runs in **“this device only”** mode
(IndexedDB), which is also available from the login screen.

## 2. Configure

### Supabase (already created for you)
Project **fishing-tracker** (`vskzvzefupyrsmblqego`, region eu-central-1, free tier).
The schema in `supabase/migrations/` is already applied. For a new project:

1. Create a project at https://supabase.com.
2. Run the SQL files in `supabase/migrations/` in order (SQL editor, or `supabase db push`).
3. Copy **Project URL** and the **publishable key** into `.env.local`.
4. Auth → URL configuration: set **Site URL** to your deployed URL (e.g. `https://your-app.vercel.app`) so confirmation emails link back correctly.
5. *(Recommended for a personal app)* After creating your own account: Auth → Providers → Email → **disable “Allow new users to sign up”**.

### AI identification
Create a key at https://console.anthropic.com → API keys and set
`ANTHROPIC_API_KEY` (server-side only — never `NEXT_PUBLIC_…`). Optional
`ANTHROPIC_MODEL` (default `claude-opus-5-5`). The endpoint requires a signed-in
user, so nobody else can spend your credit.

## 3. Deploy (Vercel)

1. Push this folder to a GitHub repo, then “Add New Project” in Vercel and import it — or run `npx vercel` from this folder.
2. Environment variables (Production + Preview):
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `ANTHROPIC_API_KEY`, optional `WORLDTIDES_API_KEY`.
3. Deploy, then set the Supabase **Site URL** to the Vercel URL.
4. On iPhone: open the URL in Safari → Share → **Add to Home Screen**.
   Open it once while online so the offline copy is stored.

## 4. Costs & free-tier limits

| Service | Cost | Notes |
|---|---|---|
| Supabase Free | $0 | 500 MB database, 1 GB file storage, 5 GB egress/month. Photos are ~300–600 KB each → roughly 2,000+ photos. Free projects **pause after 7 days of inactivity** (restore from the dashboard). Pro is $25/month if you outgrow it. |
| Vercel Hobby | $0 | Personal, non-commercial use. |
| Open-Meteo | $0 | Free for non-commercial use, no key, ~10,000 calls/day. |
| Claude API | Pay per use | Each identification sends one ~1024 px image + your species list. With `claude-opus-5-5` ($4 / $20 per million input/output tokens) that is very roughly **$0.01–0.03 per photo** (thinking tokens vary). 100 photos/month ≈ $1–3. Set a monthly spend limit in the Anthropic console. |

## 5. Demo data

Settings → **Load demo data** adds ~26 realistic trips (Al-Fintas, Qaruh,
Kubbar, Failaka) with catches, gear and two goals, all flagged `is_demo`.
**Remove demo data** deletes exactly those rows.

## 6. Data model

`supabase/migrations/20261012000001_init.sql` — tables: `profiles`, `trips`,
`catches`, `species`, `techniques`, `locations`, `equipment`, `trip_equipment`,
`catch_equipment`, `media`, `trip_media`, `achievements`, `user_achievements`,
`goals`, `environment_observations`.

* UUID primary keys, created on the device (idempotent offline sync).
* Composite foreign keys `(x_id, user_id)` so rows can never reference another user's data; RLS on every table.
* `ON DELETE CASCADE` for children (trip → catches, links, media links, observations); `ON DELETE SET NULL` for lookups (species, spot, technique, photo).
* CHECK constraints mirror the client validation (weights, depths, PE, enums, Hijri date format).
* Trip success is **derived** (≥ 1 catch), never stored.
* `media` is unique per `(user, sha256)` → the same photo is stored once.
* Photos live in the private `media` storage bucket under `<user-id>/…`, served through short-lived signed URLs.

## 7. Notes on honesty rules built into the app

* Unsuccessful trips are part of every rate; sample sizes (n) are always shown; groups with < 5 trips are flagged.
* Analytics speak of “patterns in your records”, never causes.
* Tide / weather are never inferred; missing values are reported as “not recorded”.
* Moon phase may fall back to the astronomical calculation and is labelled “calculated”.
* External data shows its source, whether it is a forecast or a model estimate, and when it was fetched.
* Estimated weights/lengths are never counted as personal records.
* AI never decides: it shows candidates with confidence and needs your confirmation; manual choice is always available.
