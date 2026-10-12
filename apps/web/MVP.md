# Explorin.app MVP

Mobile-first adventure discovery and personal scrapbooks, built with SvelteKit 3 and TypeScript. The photo-based taste profile lives at `/onboarding`, `/ask`, `/profile`, `/go/*` and `/reflect/*`; when `DATABASE_URL` is set, discovery results also show "people like you" quotes from that side.

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
- `GOOGLE_MAPS_API_KEY`: optional Google Cloud key with **Places API (New)** enabled; adds a real photo of each place to experience cards (demo and live). Server-only. One Text Search (Pro SKU, `places.id,places.photos` field mask) per place and one Place Photo media call per image, both cached in memory for 24 h. Free monthly caps: 5,000 Text Search Pro and 1,000 Place Photos; beyond that $32 and $7 per 1,000. Photos are served via `GET /api/photo?name=...`, which validates the resource name and redirects to the Google-hosted image, with the contributor attribution shown on the card as Google's policy requires. Without the key, cards keep the illustrated placeholder. The same key fetches Place Details `rating,userRatingCount,reviews` (Enterprise + Atmosphere SKU, 1,000 free per month then $25 per 1,000): at most 5 reviews in Google's relevance order, no sort control in the New API. Cards show the rating and the top review. If Places is not configured but `NIMBLE_USERNAME`/`NIMBLE_SECRET` are, reviews come from Nimble's `google_maps_reviews` instead and are labeled "via Nimble".
- Maps: the same key with **Maps Static API** enabled powers `GET /api/map` ($2 per 1,000 after 10,000 free per month, cached in memory per image). Maps are styled server-side with the brand palette (`style=paper` cream field-notes look, `style=ink` dark banner look) via Static Maps style parameters; set `GOOGLE_MAPS_MAP_ID` to a Cloud-based map style and request `style=cloud` to use a console-designed style instead. Maps appear as a polaroid inset on each card (links to Google Maps directions), the "You're here" banner during an adventure, a round stamp on the scrapbook (same-origin, so it survives PNG export), and a numbered trail map on My memories. Without the key, every map slot collapses quietly.
- `DATABASE_URL`: Postgres with pgvector. Needed for the profile routes, the database scripts, and the "people like you" quotes on discovery cards; discovery itself works without it.
- `NIMBLE_USERNAME` / `NIMBLE_SECRET`: optional legacy Maps integration; not needed for the new MVP.

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
- No authentication, payments, cloud history, or public sharing backend was added.

## Verification

```sh
npm run check       # SvelteKit sync, generated Cloudflare types, Svelte/TypeScript checks
npm run build       # adapter-node production build
npm run test:e2e    # Chrome browser test; install Chrome or change channel in config
```

Playwright covers the full mobile demo, reflections, photo processing, consent, scrapbook generation fallback, PNG download, history reload, no horizontal overflow, and API validation/error handling. Screenshots and exported PNG are under ignored `test-results/`.

The live Nimble/Gemini integration requires real keys to smoke-test; credential-free tests verify the honest error and fallback paths. The original database functionality still needs its Postgres setup. Production deployment is separate from this repository change.
