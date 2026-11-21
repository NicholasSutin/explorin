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

Premium ($4.99 a month, 3,500 credits instead of 2,000) is off until `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID` and `STRIPE_WEBHOOK_SECRET` are all set; without them Settings shows no Subscribe button. How it works: [ADR-0011](../../docs/adr/0011-premium-on-stripe.md).

**Locally, in a Stripe sandbox**

1. Put the sandbox's secret key in `STRIPE_SECRET_KEY` in `.env`. A restricted key works with Write on Customers, Checkout Sessions, Customer portal, Prices, Products and Webhook endpoints (the last three only for the setup script), and Read on Subscriptions.
2. `npm run stripe:setup` creates the price and the billing portal configuration (safe to run again) and prints `STRIPE_PRICE_ID`.
3. `npm run db:migrate -- --apply` creates `premium_billing` on the dev branch.
4. With the [Stripe CLI](https://docs.stripe.com/stripe-cli), signed in to the same sandbox:

   ```sh
   stripe listen --events customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,customer.subscription.paused,customer.subscription.resumed --forward-to http://localhost:5173/api/stripe/webhook
   ```

   Put the `whsec_…` it prints in `STRIPE_WEBHOOK_SECRET` and restart Vite.

5. Settings → **Subscribe**, pay with `4242 4242 4242 4242`, any future date and any CVC. Back on Settings, Premium shows as on and the usage card says 3,500. **Manage billing** opens Stripe's portal; cancelling there ends Premium at the end of the period (the webhook flips it then). Deleting the account deletes the Stripe customer, which cancels the subscription at once.

Returning from Checkout or the portal reads Stripe directly, so subscribing works even before the webhook arrives; renewals, failed payments and period-end cancellations need the webhook.

**Production, in this order**

1. Apply the schema to production before merging (ADR-0009: additive before the deploy): `npm run db:migrate:prod -- --apply --through 0000` while later migrations are still held back, otherwise `--apply`. If the order slips, everyone stays on the free allowance until it lands; nothing breaks.
2. Put the live key in `STRIPE_SECRET_KEY` in `.env.prod`, then `npm run stripe:setup:prod -- --webhook https://app.explorin.app/api/stripe/webhook` and copy the printed `STRIPE_PRICE_ID` and `STRIPE_WEBHOOK_SECRET` into `.env.prod`. Stripe shows the webhook secret only once.
3. `npm run secrets:web:new` from the repo root pushes the three keys to the Worker. Premium appears on the next request.

Keep sandbox and live keys, prices and database branches paired: `.env` with the sandbox and the dev branch, `.env.prod` with live and production.

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
