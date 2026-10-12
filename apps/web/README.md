# Explorin web app

Discovery-to-scrapbook at `/`, and the photo-based taste profile at `/onboarding`, `/ask`, `/profile`. One product: discovery results carry "people like you" evidence from the profile side whenever the database is configured. See [MVP.md](MVP.md) for the credential-free demo and live API configuration.

Hyper-personalized NYC experiences, recommended with evidence from how similar people felt there.
Built at the AI Engineer NYC Hackathon, October 11, 2026. Scope lives in [`../../docs/pre-build/PLAN.md`](../../docs/pre-build/PLAN.md).

**Gemini** does the seeing (photo profiler), reasoning (intent, composer, reflection analysis), Maps grounding, and embeddings.
[https://console.cloud.google.com/billing]
**Nimble** brings real public reviews (Google Maps, Tripadvisor, Yelp) for cold start, the live "right now" line, and long-tail web search.
Postgres + pgvector stores profiles, places, and reflections. Hosted on **Cloudflare Workers** with photos in **R2**.

## Setup

```bash
cp .env.example .env     # fill in keys
npm install
npm run setup            # schema + 14 seed places
npm run nimble:smoke     # confirm Nimble endpoints/fields before ingest
npm run ingest           # real reviews -> labeled reflections (or: npm run db:seed-reflections as fallback)
npm run dev              # plain Vite dev server with HMR; photos stored in .photos/
```

Scripts run with Node's `--env-file=.env`.

### Cloudflare (later)

The default build uses adapter-node and local-disk photos. Set `DEPLOY_TARGET=cloudflare` (the `build:cf`, `preview:cf`, `deploy` scripts do) to build for Workers + R2.

```bash
npx wrangler login
npx wrangler r2 bucket create explorin-photos
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put DATABASE_URL
npx wrangler secret put NIMBLE_API_KEY
npx wrangler secret put GOOGLE_MAPS_API_KEY   # optional: place photos, reviews and stylized static maps
npx wrangler secret put BETTER_AUTH_SECRET     # accounts: openssl rand -base64 32
npx wrangler secret put TURNSTILE_SECRET_KEY   # accounts: Turnstile site that lists app.explorin.app (site key is a var)
npx wrangler secret put RESEND_API_KEY         # accounts: confirmation and reset emails
cp .env .dev.vars            # wrangler reads .dev.vars for local `npm run preview`
npm run deploy
```

Optional: put [Hyperdrive](https://developers.cloudflare.com/hyperdrive/) in front of Postgres and read `platform.env.HYPERDRIVE.connectionString`.

## Demo shortcuts

- **Preset profiles:** the onboarding screen has "Demo: start from a preset profile" chips (Maya, Sam, Lee) so a second phone skips photo onboarding.
- **Personal seed persona:** give an AI agent the prompt in [`data/personas/PROMPT.md`](data/personas/PROMPT.md), save its JSON to `data/personas/<id>.json` (gitignored), then `npm run db:seed-persona -- data/personas/<id>.json`. The persona appears as a chip and their reflections become "From someone like you" evidence.
- **Cached demo prompt:** the scripted prompt ("a run with views of the water and the Empire State Building") is cached per user for 2 hours in the `response_cache` table. Run it once before presenting.
- **Seed evidence:** `npm run db:seed-reflections` loads 29 curated quotes labeled "From seed notes". Live Google data (rating, open status) is cached in `places.live` and refreshed in the background.

## How it works

1. Photos + bio -> Gemini profiler -> traits with evidence -> embedded summary
2. Prompt -> intent -> (embedding ‖ Maps grounding) -> two-axis retrieval (what + who felt it) -> composer (IDs only) -> validator -> cards
3. Start / Finish -> photo + text reflection -> Gemini emotion analysis -> stored as quotable evidence for the next person

Quotes are only ever pulled from the database by ID; the model never writes quote text. Review excerpts are labeled with their source.

## Disclosure

Code written during the event with AI-assisted coding (Claude Code). No sign-in; anonymous cookie session. Photo EXIF (including GPS) is stripped client side before upload. HEIC/HEIF photos are accepted everywhere: Safari decodes them natively, other browsers fall back to a libheif WASM decoder in a Web Worker (`src/lib/heic/`).
