# Explorin web app

Sign up, tell Explorin what you like (a few words and a quick tier list), plan a day of real places, walk it on a living map, then keep it in a scrapbook you can share. How it fits together: [docs/system-design.md](../../docs/system-design.md). Behaviour, limits and costs: [MVP.md](MVP.md).

**Gemini** narrows the tier list, picks places from the web pages Nimble finds, and drafts the scrapbook entry. **Nimble** searches the web. **Google Places** verifies places (coordinates, photos, reviews on demand); the **Maps JavaScript API** draws the trip map and **Static Maps** the scrapbook stamp. **NYC Open Data** supplies happenings. Postgres + pgvector (Tiger Cloud, through Hyperdrive on Workers) stores accounts, taste, trips, reflections and usage; photos go to R2.

## Setup

```bash
cp .env.example .env     # fill in keys (each one is explained there)
npm install              # from the repo root
npm run db:migrate       # dry run: lists pending migrations (ADR-0009); add -- --apply to run them
npm run db:seed          # optional: curated places
npm run db:seed-reflections   # optional: seed "people like you" quotes
npm run dev              # http://localhost:5173
```

Without `RESEND_API_KEY` the sign-up link is printed to the dev server console. Locally, Cloudflare's Turnstile test keys (`1x00000000000000000000AA` / `1x0000000000000000000000000000000AA`) always pass.

### Stripe Premium

1. In the Explorin Stripe sandbox, create or select the recurring $4.99 USD monthly price. Put its `price_…` ID in `STRIPE_PRICE_ID` and the sandbox server key in `STRIPE_SECRET_KEY` in `apps/web/.env`. A restricted key needs Write for Checkout Sessions, Customers and Customer portal, and Read for Subscriptions.
2. Run `npm run db:migrate -- --apply` from `apps/web` against the development branch. The schema creates `premium_billing`.
3. Enable cancellations in the Stripe customer portal for this environment. From the Stripe CLI, sign in to the same sandbox and run:

   ```sh
   stripe listen --events customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,customer.subscription.paused,customer.subscription.resumed --forward-to http://localhost:5173/api/stripe/webhook
   ```

4. Copy the listener's signing secret into `STRIPE_WEBHOOK_SECRET` in `.env` and restart Vite. In Settings, select **Subscribe** and finish Checkout with Stripe's test card `4242 4242 4242 4242`, a future expiration date, and any three-digit CVC. Verify that the webhook succeeds, Settings shows Premium active and the planner allowance shows 3,500 credits. Open **Manage billing** and cancel immediately in the sandbox to verify the account returns to the free allowance. Cancellation at period end keeps access while Stripe reports the subscription active.

For Cloudflare, apply the production database schema before deploying. Configure the live customer portal and register `https://app.explorin.app/api/stripe/webhook` as a snapshot webhook for the five events above. Add `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, and the live endpoint's `STRIPE_WEBHOOK_SECRET` through Worker secrets or the project's secret sync. Keep sandbox and live Stripe credentials, price IDs, and database branches paired with their respective environments.

### Google Cloud, once

- **Server key** (`GOOGLE_MAPS_API_KEY`): Places API (New) and Maps Static API; optionally Geocoding API (places NYC street-segment events on the map).
- **Browser key** (`GOOGLE_MAPS_BROWSER_KEY`): Maps JavaScript API only, restricted to HTTP referrers `app.explorin.app/*`, `localhost:5173/*`, `127.0.0.1:4173/*`. In production it is a `var` in `wrangler.jsonc`. Without it the trip page shows a static snapshot.

### Cloudflare

```bash
cp .env.prod.example .env.prod      # secrets; gitignored
npm run secrets:web --prefix ../..          # what is on the Worker vs. in the file
npm run secrets:web:update --prefix ../..   # push every non-empty key
npm run deploy
```

Secrets: `GEMINI_API_KEY`, `DATABASE_URL`, `NIMBLE_API_KEY`, `GOOGLE_MAPS_API_KEY`, `BETTER_AUTH_SECRET`, `TURNSTILE_SECRET_KEY`, `RESEND_API_KEY`. Vars (in `wrangler.jsonc`): `GOOGLE_MAPS_BROWSER_KEY`, `BETTER_AUTH_URL`, `TURNSTILE_SITE_KEY`, `TURNSTILE_HOSTNAMES`, `AUTH_FROM_EMAIL`, optional `MONTHLY_CREDITS`.

## Tests

```bash
npm run check                                                   # svelte-check + wrangler types
node ../../node_modules/@playwright/test/cli.js test tests/auth.spec.ts   # guards, no database needed
```

`tests/journey.spec.ts` drives the whole product from sign-up to account deletion with real Nimble, Gemini and Places calls (about 50 credits per run) and a stand-in for the Maps JavaScript API. It needs a dev server with Turnstile test keys and its log file; the command is at the top of the spec. Add `E2E_DESKTOP=1` for the laptop layout. Screenshots and the exported share images land in `test-results/`.

## Layout

| Path                                                | What                                                                                      |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `src/routes/welcome`                                | guest landing                                                                             |
| `src/routes/(auth)`                                 | sign-up link, password, sign-in, reset                                                    |
| `src/routes/(onboarding)`                           | about you, tier list                                                                      |
| `src/routes/(app)`                                  | home (plan), scrapbook, settings, with the tab bar                                        |
| `src/routes/(trip)`                                 | trip map and the end-of-day reflection                                                    |
| `src/lib/server`                                    | plan, taste, trips, keepsake, account, usage, happenings, geocode, places, nimble, gemini |
| `src/lib/scrapbook`, `src/lib/components/scrapbook` | page layout, SVG pages, book, export                                                      |
| `src/lib/gmaps.ts`, `src/lib/components/trip`       | trip map, sheet, hand-off                                                                 |
| `static/taste`                                      | tier-list photos (Unsplash License; credits in `src/lib/taste-credits.json`)              |
