# Explorin system design

**Date:** 2026-10-11 · **Status:** current as of the `monorepo` branch · **Decisions:** see [adr/](adr/)

Explorin helps someone find a real place to go in a city, live the outing, and keep a scrapbook of it. This document describes the system as built, the decisions behind it, and what to revisit as it grows. It is written for an engineer joining the repo.

## 1. Requirements

### Functional

| Flow | What it does | Where |
|---|---|---|
| Discover | Prompt + city + interests → Nimble web search → Gemini picks real places → Google Places verifies (photo, coordinates, reviews). Streams its progress. | `apps/web` route `/`, `POST /api/discover` |
| Adventure | Start an experience, add reflections (typed or voice), add 1–4 photos, generate a scrapbook story, export PNG, keep history on device. | `apps/web` route `/`, `POST /api/scrapbook` |
| People like you | Build a taste profile from photos, retrieve evidence quotes with pgvector, compose three cards, reflect afterwards and update the profile. The same retrieval also attaches quotes to discovery results. | `apps/web` routes `/onboarding`, `/ask`, `/go`, `/reflect`, `/profile`; `/api/profile`, `/api/recommend`, `/api/reflect`, `/api/experience`, `/api/upload`; `lib/server/evidence.ts` inside `/api/discover` |
| Maps | Same-origin, brand-styled static map images and Google photo redirects. | `GET /api/map`, `GET /api/photo` |
| Marketing | Public landing page and waitlist: what Explorin is, a few postcards, a link into the app, an email form writing to D1. | `apps/marketing` (SvelteKit on Workers) |

### Non-functional

- **Demo first.** One developer, hackathon timeline. Every stage degrades honestly: no AI → search matches; no search → curated set; no Places key → no photos. Nothing throws at the user.
- **Latency.** Discover end to end is dominated by two upstream calls (Nimble search ~2–4 s, Gemini pick ~2–5 s) plus Places lookups in parallel. Progress is streamed so the wait is explained.
- **Cost.** Every paid upstream (Places, Static Maps, Nimble, Gemini grounding) is cached in memory for a day or deduplicated per prompt. Free monthly caps cover a demo.
- **Privacy.** Photos are re-encoded through a canvas in the browser, which strips EXIF including GPS, before anything leaves the device. Discover history lives in `localStorage`, not on a server.
- **Scale.** Tens of concurrent users. Nothing here is designed for thousands; section 5 says what changes first.

### Constraints

- SvelteKit 3 / Svelte 5 runes, TypeScript, Tailwind for the legacy flow and plain CSS for Explorin.
- Default deploy is adapter-node (any Node host). `DEPLOY_TARGET=cloudflare` builds for Workers + R2.
- Postgres with pgvector is required by the profile flow and by the "people like you" quotes; discovery runs without it and says so in its pipeline panel.

## 2. High-level design

```
                        ┌──────────────────────────────────────────────┐
   browser              │ apps/marketing (SvelteKit Worker) ──► D1 waitlist│  → links to the app
                        └──────────────────────────────────────────────┘
      │
      │ HTTPS
      ▼
┌──────────────────────────────── apps/web (SvelteKit) ─────────────────────────────────┐
│                                                                                        │
│  routes/+page.svelte  (Explorin: discover → adventure → scrapbook → history)           │
│  routes/(profile)/*   (taste profile: onboarding, ask, you; tab header)                 │
│  routes/(flow)/*      (in-adventure pages for the profile side, no header)             │
│                                                                                        │
│  routes/api/*  ──►  lib/server/                                                        │
│     discover ──────► discover.ts ──► nimble.ts (web search)                            │
│                                  ──► gemini.ts (adventureAI: pick places)              │
│                                  ──► places.ts (Text Search, Place Details, photos)    │
│                                  ──► evidence.ts (people like you: pgvector quotes)    │
│     scrapbook ─────► gemini.ts (adventureAI: story)                                    │
│     map / photo ───► maps.ts / places.ts (cached proxies, key never leaves server)     │
│     recommend ─────► recommend.ts ──► db.ts (pgvector retrieval) + gemini.ts + nimble  │
│     profile / reflect ► profile.ts / reflect.ts ──► db.ts, gemini.ts, #storage         │
│     upload ────────► #storage (storage.local.ts | storage.r2.ts, chosen at build)      │
│                                                                                        │
│  lib/server/http.ts : timedFetch, fetchJson, ttlCache, parseBody (shared plumbing)     │
│  hooks.server.ts    : anonymous uid cookie; handleError gives unknown errors one message│
└──────────┬──────────────────┬───────────────────┬───────────────────┬──────────────────┘
           │                  │                   │                   │
     Google Gemini      Nimble SDK/Web API   Google Places +     Postgres + pgvector
   (3.8-flash, embed,   (search, extract,    Static Maps          (legacy flow only)
    Maps grounding)      Maps reviews)
```

### Data flow: discover (the main path)

```
UI ── POST /api/discover (Accept: application/x-ndjson) ──► runDiscovery(input, emit)
      ◄── {step: search running}
      ◄── {step: search done, items: page titles}          Nimble /v2/search (8 results)
      ◄── {step: ai running}
      ◄── {step: ai done, items: place names}              Gemini picks ≤4 named places (JSON)
      ◄── {step: places running}
      ◄── {step: places done, "3 on the map · 3 photos"}   Places Text Search + Details, in parallel per place
      ◄── {step: people running}
      ◄── {step: people done, "4 quotes for 2 places"}      embed(prompt) + one pgvector query scoped to these place names
      ◄── {result: {experiences, mode, notice}}
```

Each stage has a fallback: no search results → 503 with a message and the curated set offered; AI unparseable → the search matches themselves become the experiences; no Places key → the step is marked skipped; no database or no matching reflections → the people step is marked skipped and cards simply have no quotes.

### Data flow: adventure and scrapbook

Everything after "Start adventure" is client-side state until `POST /api/scrapbook`, which receives only the title, location and the reflection texts (never photos). The response is a story or an honest non-AI fallback. The finished `Adventure` (photos as JPEG data URLs) is written to `localStorage` under `explorin.history.v1`, capped at 12.

### API contracts

All JSON routes validate with zod through `parseBody` and fail with SvelteKit `error(400, message)`, so every error body carries a `message` (Kit adds `status` on its own responses). The client reads `message`. Photo references in request bodies are restricted to storage keys and inline data URLs (`photoUrl` in `http.ts`), so the server never fetches a remote URL on a user's behalf.

| Route | Body / query | Success |
|---|---|---|
| `POST /api/discover` | `{prompt, location, interests[], insights[], about, demo}` | NDJSON events, or `{experiences, mode, notice, steps}` as plain JSON |
| `POST /api/scrapbook` | `{title, location, reflections[]}` | `{title, summary, aiGenerated, model?, ms}` |
| `GET /api/map` | `lat,lng,zoom` or `pins`, `w,h,style,numbered,trail` | `image/png`, cached a day |
| `GET /api/photo` | `name=places/…/photos/…` | 302 to the Google-hosted image |
| `POST /api/profile` · `GET` | `{name, photoUrls[], bio?}` | `{profile}` |
| `POST /api/recommend` | `{prompt, lat?, lng?}` | `{feasibility_note, cards[], attribution}` |
| `POST /api/reflect` | `{experienceId, text, photoUrls[], consent}` | analysis + updated profile |
| `POST`/`PATCH /api/experience` | `{experienceId}` | start / finish timestamps |
| `POST /api/upload` | multipart `files` (JPEG, PNG or WebP) | `{urls[]}` (`/photos/<key>`) |
| `GET /api/demo` · `GET`/`POST /api/demo/persona` | `{persona}` | health counts; preset profiles for the legacy flow |

### Storage choices

| Data | Store | Why |
|---|---|---|
| Discover history, about-you context | `localStorage` | Private by default, no account, survives reload. Capped at 12 adventures. |
| Uploaded profile photos (legacy) | local disk (`.photos/`) or R2, chosen by `#storage` alias at build time | Same API, no runtime branching. |
| Profiles, places, experiences, reflections, demo response cache | Postgres + pgvector | Two-axis retrieval (what + who) needs vector search. |
| Upstream responses (Places, Static Maps, Nimble reviews, grounded prompts) | in-process `ttlCache` | Pays once per process per day; see section 5 for the multi-isolate caveat. |

## 3. Deep dive

### Data model (Postgres)

```
users(id, name)
profiles(user_id → users, traits jsonb, summary, embedding vector(768))
places(id, google_place_id, name, kind, lat, lng, tags[], notes, maps_url, live jsonb, live_at)
experiences(id, user_id, place_id, prompt, status, started_at, finished_at)
reflections(id, place_id, experience_id, author_id, source, display_name, body, quote,
            emotions[], themes[], photo_urls[], consent_share,
            embedding vector(768), author_profile_embedding vector(768))
response_cache(key, value jsonb, created_at)
```

Retrieval scores a reflection as `0.6·sim(intent, body) + 0.4·sim(profile, author_profile) + 0.05 if first-party`. Curated places carry honest tags (`esb_view`, `water_view`) so the composer cannot claim a view a place lacks; the composer only returns IDs and `validateCards` drops anything it did not get.

### Discover types

`Experience` (`lib/adventure.ts`) is the single shape that flows from the server pipeline to the UI and into history: `place` and `location` are separate fields, `placeQuery` drives the Places lookup, and `photo`, `coords`, `reviews` are added by enrichment. `DiscoveryStep` is the streamed progress unit, keyed by stage id.

### Caching strategy

| What | Key | TTL | Bound |
|---|---|---|---|
| Place lookup, photo URI, Google reviews | normalized query / photo name / place id | 1 day | 1000 entries each |
| Static map image | full upstream URL | 1 day | 300 images |
| Nimble Maps reviews | normalized query (including "no such place"; failures are not cached) | 1 day | 1000 |
| Maps-grounded prompts (background enrichment) | normalized prompt | 1 hour | 500 |
| Demo recommend response | `uid:prompt` in Postgres | 2 hours | n/a |

Browser-facing routes also send `Cache-Control` (`/api/map` a day, `/api/photo` an hour, `/photos/*` immutable).

### Error handling and retries

- The Nimble, Places and Static Maps wrappers never throw: they return `null` or `[]` and log once, and a failed request is not cached (only a real "no match" is). Their timeouts use `AbortSignal.timeout`, so a slow upstream stops costing when the caller gives up. The Gemini helpers used by the legacy flow (`generateJson`, `embed`, `groundedPlaces`) do throw and rely on the route's error handling; `adventureAI` is the null-returning, 18 s-bounded one.
- Routes throw `error(status, message)`. The `handleError` hook turns anything else into one generic message after logging the cause.
- No automatic retries. Each upstream is a user-visible step; the user retries by pressing the button, and caches make the second attempt cheap.
- Background work (`enrichWithMaps`, live refresh) is fire-and-forget and catches its own errors.

### Queues and events

None. The only "event" surface is the NDJSON stream from `/api/discover`, which exists so the UI can show the pipeline rather than a spinner. A queue is not warranted until background enrichment needs to outlive a request on Workers (see 5).

## 4. Scale and reliability

**Load estimate.** A demo day is ~100 discover runs and a few hundred map views. Each discover is 1 Nimble call, 1 Gemini call, ≤4 Places Text Searches and ≤4 Place Details. All inside free monthly caps; a popular week would be the first time Places billing matters (Text Search Pro is $32 per 1k after 5k free).

**Scaling.** The web app is stateless apart from in-process caches, so it scales horizontally on either target. Postgres (`max: 5` connections per process) is the first shared bottleneck; on Workers the comment in `wrangler.jsonc` points at Hyperdrive for pooling.

**Failure modes.**

| Failure | Effect | Mitigation |
|---|---|---|
| Nimble down / no key | Discover answers 503 with a message; curated set still works | Honest fallback, demo mode |
| Gemini down | Search matches are shown as experiences; scrapbook uses the user's own words | `adventureAI` returns null |
| Places down / no key | No photos, coordinates or reviews; map images hidden | Steps marked skipped |
| Postgres down | Profile routes fail; discovery loses its quotes and marks the people step failed | `evidence.ts` catches and continues; `db.ts` is loaded lazily on that path |
| Worker isolate recycled | Caches cold; next request pays upstream once | Acceptable at demo scale |

**Monitoring.** Workers observability is on in `wrangler.jsonc`. Adapter-node logs timing laps for recommend (`[recommend] …`) and route failures through `handleError`. There are no alerts; add them when there is an SLO.

## 5. Trade-offs and what to revisit

| Decision | Chosen | Alternative | Why, and when to revisit |
|---|---|---|---|
| Monorepo via npm workspaces ([ADR-0001](adr/0001-monorepo-workspaces.md)) | `apps/*`, `packages/*` | separate repos | One developer, shared brand; revisit never at this size |
| Marketing site ([ADR-0006](adr/0006-marketing-on-workers-with-waitlist.md), supersedes ADR-0002) | SvelteKit on Workers, D1 waitlist | Astro; static page plus a separate Worker | Same toolchain as the app; the waitlist needed a server and storage |
| One product ([ADR-0003](adr/0003-one-product.md), [ADR-0005](adr/0005-people-like-you-in-discovery.md)) | profile flow kept and linked; its retrieval feeds discovery | delete it, or keep two unlinked flows | "People like you" is the differentiator; discovery still works without a database |
| Deploy targets ([ADR-0004](adr/0004-deploy-targets.md)) | adapter-node default, Cloudflare behind a flag | one target | Node is simplest for dev and the demo; Workers is where the R2 photos live |
| In-process caches | `ttlCache` Maps | Cloudflare Cache API / KV | Simplest; revisit when running on many isolates, by caching `/api/map` and `/api/photo` responses with the Cache API (they already send `Cache-Control`) |
| Photos as data URLs in `localStorage` | simple, private | IndexedDB blobs | `localStorage` is ~5 MB; 12 adventures × 4 photos at 1200 px fits. Revisit if history grows or photos get bigger |
| Fire-and-forget background work | `void promise` | queue / `waitUntil` | On Workers, work after the response may be cancelled; use `platform.context.waitUntil` when deploying the legacy flow there |
| Single city in the profile flow | `CITY` constant | per-request city | Discover is already city-parameterised; lift `CITY` to a request parameter when a second city appears |
| Prompt-string demo cache | exact prompt match | explicit `demo` flag | Discover already uses a flag; align recommend with it |
| Place matching for quotes | name containment against `places.name` | Google place ID join | Works for the curated set and demo; join on `google_place_id` once discovery places are upserted into `places` (ADR-0005 step 2) |
