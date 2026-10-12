# Explorin.app MVP

Mobile-first adventure discovery and personal scrapbooks, built with SvelteKit 3 and TypeScript. Accounts (`/signup`, `/signup/password`, `/login`, `/forgot`, `/reset-password`) and the one-screen onboarding at `/onboarding` sit in front of the photo-based taste profile (`/onboarding/photos`, `/ask`, `/profile`, `/go/*`, `/reflect/*`); when `DATABASE_URL` is set, discovery results also show "people like you" quotes from that side.

## Quick start

Requires Node.js 22.12+ (Node 24 recommended).

```sh
cd apps/web
npm install
npm run dev
```

Open the local URL, then press **Try the NYC demo** (in the hero). No keys or database are needed for this complete demo: choose a real curated NYC experience, start, type reflections, finish, add 1-4 photos, create the scrapbook, download PNG, and revisit My memories after reload.

For live discovery, copy `.env.example` to `.env` and set:

- `NIMBLE_API_KEY`: Nimble SDK Bearer API key; required for live search. Server-only POST `/v2/search` using the existing integration. Optional `NIMBLE_BASE_URL` defaults to `https://sdk.nimbleway.com`. Contract: https://docs.nimbleway.com/nimble-sdk/web-tools/search
- `GEMINI_API_KEY`: Google AI Studio API key; required for AI ranking and emotional scrapbook writing. New MVP uses `gemini-3.8-flash` with an 18-second timeout.
- `GOOGLE_MAPS_API_KEY`: optional Google Cloud key with **Places API (New)** enabled; adds a real photo of each place to experience cards (demo and live). Server-only. One Text Search (Pro SKU, `places.id,places.photos` field mask) per place and one Place Photo media call per image, both cached in memory for 24 h. Free monthly caps: 5,000 Text Search Pro and 1,000 Place Photos; beyond that $32 and $7 per 1,000. Photos are served via `GET /api/photo?name=...`, which validates the resource name and redirects to the Google-hosted image, with the contributor attribution shown on the card as Google's policy requires. Without the key, cards keep the illustrated placeholder. The same key fetches Place Details `rating,userRatingCount,reviews` (Enterprise + Atmosphere SKU, 1,000 free per month then $25 per 1,000): at most 5 reviews in Google's relevance order, no sort control in the New API. Cards show the rating and the top review.
- Maps: the same key with **Maps Static API** enabled powers `GET /api/map` ($2 per 1,000 after 10,000 free per month, cached in memory per image). Maps are styled server-side with the brand palette (`style=paper` cream field-notes look, `style=ink` dark banner look) via Static Maps style parameters; set `GOOGLE_MAPS_MAP_ID` to a Cloud-based map style and request `style=cloud` to use a console-designed style instead. Maps appear as a polaroid inset on each card (links to Google Maps directions), the "You're here" banner during an adventure, a round stamp on the scrapbook (same-origin, so it survives PNG export), and a numbered trail map on My memories. Without the key, every map slot collapses quietly.
- `DATABASE_URL`: Postgres with pgvector. Needed for accounts, the profile routes, the database scripts, and the "people like you" quotes on discovery cards; discovery itself works without it. `npm run db:migrate` applies `scripts/schema.sql`, including the account tables.
- Accounts: `BETTER_AUTH_SECRET` (required for sign-in; `openssl rand -base64 32`), `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` / `TURNSTILE_HOSTNAMES` (Cloudflare Turnstile gates the sign-up link, sign-in and password reset; the test keys in `.env.example` always pass in dev), `RESEND_API_KEY` and `AUTH_FROM_EMAIL` (sign-up and reset emails; without the key the link is printed to the dev console). `BETTER_AUTH_URL` is the public origin used in emailed links; set it in production.

Never expose keys using public environment variables. For Cloudflare, use Wrangler secrets as described in `README.md`.

## Behavior and limits

- Natural-language prompt, city, and optional interests drive Nimble search. AI ranks supplied result IDs and writes a personalized explanation; it cannot fabricate new candidate URLs.
- Search errors show an actionable message; curated demo results are always explicitly labeled. Without Gemini, live search matches remain usable and scrapbooks use the traveler's written words with a visible fallback label.
- Browser speech recognition has typed fallback. Voice requires a compatible browser, microphone permission, and usually HTTPS or localhost; recognition may use the browser vendor's service. Speech transcripts can be reviewed before saving. Actual microphone capture requires manual testing.
- Photos accept JPG, PNG, WebP, or HEIC/HEIF (iPhone photos), maximum 15 MB each. They are decoded and redrawn to remove metadata, resized to 1200 pixels, and stored as JPEG data URLs on the device. Browsers without native HEIC support decode it in a Web Worker with libheif (WASM, loaded on first use). Photo pixels are not sent to the AI service; scrapbook generation uses written reflections and place details.
- Written reflections are sent server-side to Gemini when configured. Future personalization sends only summaries explicitly opted into, and only when the discovery opt-in checkbox is selected. Insights are not published or pooled across users.
- History stores up to 12 recent adventures in this browser's local storage. Photo storage can exhaust the browser quota; the UI retains the current scrapbook for download, offers retry, and allows deleting old history. History does not sync across devices. Refreshing during an unfinished adventure loses that session.
- Export uses `html-to-image`. Share uses Web Share file support when available and otherwise downloads the PNG. Actual native share sheet requires manual device testing.
- Search results are source-backed suggestions, sometimes articles or lists; check source links for availability, directions, prices, and hours. This MVP does not geocode, book, or verify individual venues in every search result.
- Accounts use [better-auth](https://www.better-auth.com). Sign-up is email first: `/signup` takes an address and a Turnstile token and the magic-link plugin emails a one-hour, single-use link (`/api/auth/sign-in/magic-link`); opening it creates the account already verified, starts the session and lands on `/signup/password`, where the password is set through the server-only `setPassword` endpoint (it refuses to overwrite an existing one). Sign-in is then email and password. The same link signs an existing account in, and an expired link returns to `/signup?error=…`. Direct `POST /sign-up/email` is disabled. The link request, sign-in and password reset require a Turnstile token (`x-captcha-response`), verified server-side with the `auth` action and the hostname allow-list. Sessions last 30 days in Postgres (`user`, `session`, `account`, `verification` tables); every new account is mirrored into `users` so profiles, experiences and reflections keep their foreign keys. Account ids are UUIDs, the same value the rest of the schema uses.
- Onboarding after confirmation is one screen (`/onboarding`: name, home city, interests) stored on the account, then the optional photo-profile step (`/onboarding/photos`, skippable). `/onboarding`, `/ask`, `/profile`, `/go/*`, `/reflect/*` and the per-account write APIs require a signed-in account; signed-in but not yet onboarded users are routed to `/onboarding`. Discovery, the NYC demo, scrapbooks and device history stay open to guests under the anonymous `uid` cookie, so the demo needs no account.
- Without `BETTER_AUTH_SECRET` every `/api/auth/*` request answers 503, no session is ever read, and the account pages say so; the rest of the app is unchanged. Rate limiting is Cloudflare's rate-limit bindings (`ratelimits` in `wrangler.jsonc`, applied in `hooks.server.ts` before better-auth sees the request): sign-in 10/min, sign-up 5/min, emails 3/min, token checks 10/min, each counted per client (IPv6 /64) and per target email. better-auth's in-memory limiter is disabled. Outside Workers there are no bindings and the gate is skipped; on Workers a missing binding answers 503 rather than running unlimited. On Workers every request also gets its own single Postgres connection (`requestSql()` in `db.ts`), closed when the response body ends, because Workers refuse a socket opened by another request. Those connections go through Hyperdrive (`HYPERDRIVE` binding, config `explorin-db`), which pools them at the edge so a fresh connection per request costs a local handshake rather than a TLS round trip to Tiger Data.
- No payments, cloud history, or public sharing backend was added.

## Verification

```sh
npm run check       # SvelteKit sync, generated Cloudflare types, Svelte/TypeScript checks
npm run build       # adapter-node production build
npm run test:e2e    # Chrome browser test; install Chrome or change channel in config
```

Playwright covers the full mobile demo, reflections, photo processing, consent, scrapbook generation fallback, PNG download, history reload, no horizontal overflow, and API validation/error handling. Screenshots and exported PNG are under ignored `test-results/`.

The live Nimble/Gemini integration requires real keys to smoke-test; credential-free tests verify the honest error and fallback paths. The original database functionality still needs its Postgres setup. Production deployment is separate from this repository change.
