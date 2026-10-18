# Explorin system design

**Date:** 2026-10-17 · **Status:** current as of the `feat/vision` branch · **Decisions:** see [adr/](adr/)

Explorin learns what someone likes, plans a day of real places around it, walks them through it on a map, and keeps the day in a scrapbook. This document describes the system as built, the decisions behind it, and what to revisit as it grows. It is written for an engineer joining the repo.

## 1. Requirements

### Functional

| Flow       | What it does                                                                                                                                                                                                                           | Where                                                              |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Account    | Email-link sign-up, password, sign-in, reset. Every page needs an account ([ADR-0007](adr/0007-sign-in-first-single-flow.md)).                                                                                                         | `(auth)/*`, `/api/auth/*`, `hooks.server.ts`                       |
| Onboarding | Name, home city, a free-text blurb, interests, who they plan for; then a tier list (S+, A+, A, B, C, NO) over ~10 photo cards that Gemini picks from a 31-card catalog.                                                                | `/onboarding`, `/onboarding/taste`, `/api/taste`                   |
| Plan       | Today's request + taste → Nimble search ×2 → Gemini picks 5–7 real places → Places verifies → walking order → NYC happenings → "people like you" quotes → a saved trip. Streams its progress.                                          | `/` (home), `POST /api/plan`                                       |
| Trip       | Interactive Google map (paper style): stop pins, trail, happenings, tappable landmarks, live position, check-in (auto-prompted within 70 m), hand-off to Apple or Google Maps per stop, on-demand Google reviews.                      | `/trip/[id]`, `/api/trip/*`, `/api/place/*`                        |
| Reflect    | Note (typed or dictated), up to 4 photos, highlight stop; Gemini drafts title, story, emotions, a quotable line and six "best for" tags; keep up to 3. The note becomes a "people like you" reflection (one line shared with consent). | `/trip/[id]/done`, `/api/trip/[id]/draft`, `/api/trip/[id]/finish` |
| Scrapbook  | Finished days as SVG pages in a cloth-bound book with 3D page turns (optional). Share as Story 9:16, Post 4:5 or Page 3:4 PNG through the native share sheet, or download.                                                             | `/scrapbook/[[id]]`                                                |
| Settings   | Edit profile and taste, re-grade, page-flip toggle, usage this month (credits by service and by day), change password, sign out, delete everything.                                                                                    | `/settings`                                                        |
| Marketing  | Landing page and waitlist (D1, Turnstile, Resend).                                                                                                                                                                                     | `apps/marketing`                                                   |

### Non-functional

- **Cost first.** Every paid call is the cheapest SKU that does the job, cached where allowed, and metered per person in `usage_events` at list prices. Plans stop at `MONTHLY_CREDITS` (default 2000 credits = $2) per person per month.
- **Honest degradation.** No search or AI → the curated NYC set; no Places key → no pins; no browser key or a rejected one → a static map; no NYC → no happenings. Each is a visible pipeline step, never a silent gap.
- **Google's terms.** Places content only on Google maps; place ids stored, coordinates kept ≤30 days, photos and names fetched when shown ([ADR-0008](adr/0008-trip-map-on-google-maps.md)).
- **Privacy.** Photos are re-encoded in the browser (EXIF and GPS stripped) and served only to their owner. Shared quotes need consent. Deletion removes everything.
- **Latency.** First plan step within ~200 ms; a full plan is dominated by Nimble (~2–3 s) and Gemini (~3–6 s).

### Constraints

SvelteKit 3 / Svelte 5 runes, TypeScript, Tailwind 4 with the brand tokens in `routes/layout.css`. Cloudflare Workers + R2 + Hyperdrive in production (`DEPLOY_TARGET=cloudflare`), adapter-node and local disk in dev. Postgres with pgvector (Tiger Cloud).

## 2. High-level design

```
browser ── app.explorin.app ──► apps/web (SvelteKit on Workers)
                                  │
  routes/welcome                  │ guests only
  routes/(auth)/*                 │ better-auth pages
  routes/(onboarding)/*           │ about you, tier list
  routes/(app)/  /  scrapbook  settings      tab bar shell
  routes/(trip)/trip/[id](/done)  │ full-bleed map, reflect
                                  │
  api/plan ───────► plan.ts ──► nimble.ts (search ×2) · gemini.ts (pick) · places.ts (verify)
                               geo.ts (order) · happenings.ts → geocode.ts · evidence.ts (pgvector)
                               trips.ts (save)
  api/taste ──────► taste.ts (save grades, Gemini narrowing)
  api/trip/* ─────► trips.ts · keepsake.ts (draft, save, reflection)
  api/place/* ────► places.ts (landmark card, reviews on demand)
  api/map, api/photo ► maps.ts, places.ts (keyed proxies)
  api/upload, photos/[...key] ► #storage (R2 | .photos/)
  hooks.server.ts : guards, onboarding gate, usage flush + connection close after the response
                                  │
    Gemini (flash, embeddings) · Nimble · Google Places / Static Maps / Geocoding · NYC Open Data + GeoSearch
    Postgres + pgvector via Hyperdrive · R2 (photos)
browser ──► Google Maps JavaScript API (trip map, referrer-restricted key)
```

### Data flow: plan

```
UI ── POST /api/plan {prompt, city, window, origin?} (NDJSON) ──► credits check (429 past the cap) → runPlan
  ◄ taste       done  "Leaning into coffee shops, hidden gems"      taste.summary + grades
  ◄ search      done  "14 pages read"                              Nimble /v2/search ×2 in parallel
  ◄ ai          done  "6 places named in those pages"              Gemini: names only from the pages, skips NO grades
  ◄ places      done  "6 on the map"                               Text Search (Pro) per place, outliers dropped
  ◄ route       done  "6 stops · about 3.1 km on foot"             nearest neighbour + 2-opt from origin
  ◄ happenings  done  "3 events near your stops"   ┐ in parallel   NYC Open Data → GeoSearch / Google Geocoding
  ◄ people      done  "2 quotes, weighted by taste"┘               embed(prompt) + pgvector over reflections
  ◄ result      {tripId}                                           trips + trip_stops written
```

### Data flow: trip → keepsake → scrapbook

The trip page loads the trip with fresh photos (Place Details Essentials by place id). Check-ins `PATCH` a stop with the person's own GPS fix when they are within 400 m. Finishing uploads photos, asks `/draft` for the AI keepsake, then `/finish` writes the trip fields and a `reflections` row for the highlight place (embedding of the note, author's taste embedding, `consent_share` only when they agreed and there is a quote). The scrapbook renders each finished trip with `layoutPage` → `Page.svelte`; sharing rasterises the same layout (`export.ts`).

### API contracts

All JSON routes validate with zod via `parseBody` and fail with `error(status, message)`. Guests get 401 JSON from every `/api/*` except `/api/auth/*`.

| Route                                       | Body / query                                                                                        | Success                                                                                            |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `POST /api/plan`                            | `{prompt, city, window, origin?}`                                                                   | NDJSON `step` events, then `{type:'result', tripId}` or `{type:'error'}`; 429 past the monthly cap |
| `GET /api/taste?count=` · `POST /api/taste` | `{grades, offered, finish}`                                                                         | next card ids · `{ok}` (finish marks onboarded)                                                    |
| `PATCH /api/trip/:id/stops/:stopId`         | `{inPlan?, visited?, at?}`                                                                          | `{ok}`                                                                                             |
| `POST /api/trip/:id/stops`                  | `{placeId}`                                                                                         | `{stop}` (landmark added from the map)                                                             |
| `POST /api/trip/:id/draft`                  | `{note}`                                                                                            | `{title, story, emotions, quote, bestForOptions, aiGenerated}`                                     |
| `POST /api/trip/:id/finish`                 | `{note, photoUrls, highlightStopId, bestFor, bestForOptions, title, story, emotions, quote, share}` | `{ok}`                                                                                             |
| `DELETE /api/trip/:id`                      |                                                                                                     | `{ok}`                                                                                             |
| `GET /api/place/:placeId` · `/reviews`      |                                                                                                     | landmark card · rating + up to 5 reviews                                                           |
| `GET /api/map` · `GET /api/photo`           | static map params · photo name                                                                      | PNG · 302 to Google's image                                                                        |
| `POST /api/upload`                          | multipart `files`                                                                                   | `{urls[]}` under `/photos/<user id>/`                                                              |

### Storage

| Data               | Store                                                              | Notes                                                                   |
| ------------------ | ------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| Accounts, sessions | Postgres (`user`, `session`, `account`, `verification`)            | better-auth; mirrored into `users(id, name)`                            |
| Taste              | `taste`                                                            | blurb, interests, audience, grades, summary, embedding, flip preference |
| Trips              | `trips`, `trip_stops`                                              | stops: place id, own text, coordinates with `coords_at`, check-in GPS   |
| Evidence           | `places`, `reflections`                                            | "people like you": two embeddings per reflection                        |
| Usage              | `usage_events`                                                     | one row per billed call, micro-dollars                                  |
| Geocodes           | `geocode_cache`                                                    | shared, 30 days, misses included                                        |
| Photos             | R2 `explorin-photos` (`<user id>/<uuid>.jpg`) or `.photos/` in dev | owner-only route                                                        |
| Upstream responses | in-process `ttlCache`                                              | Places lookups, photo URIs, reviews, static maps: 1 day                 |

## 3. Deep dive

### Data model (v1 additions)

```
taste(user_id → users, blurb, interests[], audience[], grades jsonb, offered[], summary, embedding vector(768), flip_animations)
trips(id, user_id → users, prompt, city, day_window, title, status, happenings jsonb, note, photo_urls[],
      best_for[], best_for_options[], story_title, story, emotions[], highlight_stop_id, created/started/finished_at)
trip_stops(id, trip_id → trips, position, google_place_id, data jsonb, lat, lng, coords_at, in_plan, added_by,
           visited_at, visited_lat, visited_lng)
usage_events(id, user_id → users, service, operation, units, cost_micros, created_at)
geocode_cache(query, lat, lng, source, fetched_at)
```

All personal tables cascade from `users(id)`; `account.ts` deletes the legacy ones (`reflections`, `experiences`, `profiles`) explicitly, then R2 photos, then the better-auth user.

### Tier-list narrowing

`#lib/taste` holds the 31-card catalog (activity types, vibes, company) with the interests that make each worth asking. `rankCategories` is deterministic: interest score, at least one food/outdoors/culture card, at most four per cluster, and one side of each opposite pair (cheap/upscale, fast/slow, quiet/lively, hidden/famous). Gemini picks the first round from the same catalog by id (validated), and the ranking fills gaps. Audience ("for teens", "35–60s", …) is a multi-select in step 1 rather than a grade.

### Usage and credits

`track()` pushes `{service, operation, units, cost_micros}` onto `locals.usage` at the point a billed request leaves (cache hits never record). `hooks.server.ts` writes them in one insert after the response body and every `background()` task finish, on the request's own connection, then closes it on Workers. Gemini cost comes from `usageMetadata`; embeddings are estimated from text length; flat prices live in `pricing.ts`. Settings reads the month's sum; `POST /api/plan` refuses past `MONTHLY_CREDITS`.

### Scrapbook rendering and export

`layoutPage(trip, format)` computes every position (polaroids with seeded tilt, tape, stamp, stops, wrapped note, stickers) for `page` 600×800, `post` 1080×1350 and `story` 1080×1920. `Page.svelte` draws it as SVG (feTurbulence grain, dot grid, drop shadows, textPath postmark). An SVG drawn as an image cannot load images, so `export.ts` paints three passes on a canvas: the `base` SVG, then photos and the static map with the same rotation and clip, then the `overlay` SVG with Caveat embedded as a data URL. The PNG is rendered as the share dialog opens so `navigator.share` runs inside the tap (iOS rejects it after slow work).

### Error handling

Upstream wrappers return `null`/`[]` and never cache failures. `adventureAI` is bounded at 18 s and returns null; `generateJson` and `embed` throw and are caught by their callers. Routes throw `error()`; `handleError` logs and returns one message. No automatic retries: each upstream is a visible step.

## 4. Scale and reliability

**Cost per person.** A plan is about 2 Nimble searches, 1 Gemini call, ~6 Text Searches, 1 embedding and a handful of geocodes; a trip view adds 1 map load and up to ~8 Essentials refreshes and photos. At list prices that is roughly 25–60 credits ($0.03–0.06) per planned day, usually inside Google's free monthly allowances.

**Scaling.** Stateless apart from per-isolate caches. Postgres connections go through Hyperdrive (pool 20 to Tiger, which allows ~90); each Worker request opens one connection lazily and closes it after the response.

| Failure                         | Effect                                                                           | Mitigation                          |
| ------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------- |
| Nimble down / no key            | Curated NYC set (other cities: clear error)                                      | `curated` step                      |
| Gemini down                     | Curated set for plans; keepsake falls back to the note; narrowing to the ranking | null-returning helpers              |
| Places down / no key            | No pins or photos; static map empty                                              | steps marked skipped                |
| Browser key missing or rejected | Static snapshot instead of the live map                                          | `gm_authFailure` + overlay check    |
| NYC Open Data / GeoSearch down  | No happenings                                                                    | step reports nothing nearby         |
| Postgres down                   | App unusable (accounts)                                                          | Hyperdrive retries; no offline mode |

**Monitoring.** Workers observability is on. Usage events double as a per-person cost log. No alerts yet.

## 5. Trade-offs and what to revisit

| Decision                                                          | Chosen                                                           | Alternative                           | Revisit when                                                              |
| ----------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------- |
| Sign-in first ([ADR-0007](adr/0007-sign-in-first-single-flow.md)) | one flow, accounts required                                      | guest demo beside it                  | a public "try it" is wanted (needs its own budget)                        |
| Trip map ([ADR-0008](adr/0008-trip-map-on-google-maps.md))        | Google Maps JS, JSON style, overlay markers                      | MapLibre + OSM                        | Places stops being the data source                                        |
| Happenings                                                        | NYC Open Data permitted events                                   | event APIs (Ticketmaster, Eventbrite) | a second city launches                                                    |
| Migrations ([ADR-0009](adr/0009-versioned-migrations.md))         | idempotent `schema.sql` + numbered SQL files, dry run by default | a migration tool with down-migrations | dev and prod stop sharing one database, or migrations need to run from CI |
| Caches                                                            | in-process `ttlCache`                                            | Cache API / KV                        | traffic spans many isolates (photo and map proxies first)                 |
| Credits                                                           | soft per-person monthly cap                                      | per-plan pricing, paid tiers          | costs or abuse show up in `usage_events`                                  |
| Scrapbook export                                                  | SVG layers + canvas                                              | server-side rendering                 | a format needs fonts or images the browser can't embed                    |
