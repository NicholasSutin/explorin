# ADR-0011: Explorin Premium on Stripe Checkout

**Status:** Accepted
**Date:** 2026-11-20
**Deciders:** Nick Sutin, Simeon

## Context

Planning stops at `MONTHLY_CREDITS` (2,000 credits, $2 of estimated upstream spend) per person per month. People who plan more need a way to pay for more. Explorin runs on Cloudflare Workers with Postgres on Neon and has no billing system, no card handling and no admin surface. The constraints:

- **No card data near the app.** Explorin should never see a card number or carry PCI scope.
- **Small surface.** One plan, monthly, with cancel and card updates handled elsewhere.
- **Correct entitlements.** Webhooks arrive late, twice or out of order, and access must still match what the person pays for.
- **Deletion stays complete.** Deleting an account already removes everything at once ([system-design.md](../system-design.md) §3); billing must not leave a person charged for an account that is gone.

## Decision

Explorin Premium is one Stripe subscription ($4.99 a month, `PREMIUM_PRICE` in `src/lib/premium.ts`) that raises the monthly allowance to 3,500 credits.

- **Hosted pages.** Subscribing goes to Stripe Checkout. Managing (cancel, card, invoices) goes to Stripe's billing portal. The app only creates sessions and redirects; both redirects are checked against Stripe's hosts.
- **REST without an SDK.** `billing.ts` calls the API with `fetch` and a pinned `Stripe-Version`, as the other upstream wrappers do, and verifies webhook signatures with Web Crypto. That avoids a Node-oriented dependency in the Worker.
- **Stripe is the source of truth.** `premium_billing` keeps the customer id, the last Checkout started and the last status read. Each webhook event, and each return from Checkout or the portal, re-reads all of the customer's subscriptions instead of trusting the event's snapshot. Replays and out-of-order deliveries therefore settle on the current state, and Settings shows the result of a payment before the webhook lands.
- **One lock per person.** Checkout, syncs and account deletion run inside a transaction holding `SELECT … FOR UPDATE` on the person's `users` row. Two tabs can't open two subscriptions, and a deletion can't race a Checkout.
- **Entitlement.** `active`, `trialing` and `past_due` grant Premium; past_due covers Stripe's retries after a failed renewal. Any subscription that isn't over (including `incomplete`, `unpaid`, `paused`) blocks a second Checkout. Every subscription on these customers counts, since Explorin creates the customer only for Premium, so a later price change keeps existing subscribers.
- **Deletion ends billing first.** Deleting an account deletes the Stripe customer inside the deletion transaction. Stripe then cancels any subscription immediately (no refund for the rest of the period), drops the saved card, and blocks new subscriptions on that customer, so an open Checkout can't start one. If Stripe can't be reached, nothing is deleted and the person is asked to retry.
- **Setup as a script.** `npm run stripe:setup[:prod]` creates or updates the price (by lookup key), a tagged billing portal configuration (cancel at period end, card updates, invoices) and, with `--webhook`, the webhook endpoint. The app looks the portal configuration up by its tag, so the Dashboard's default doesn't have to be saved by hand.
- **Off until configured.** Without `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID` and `STRIPE_WEBHOOK_SECRET`, Settings shows no Subscribe button. Until `premium_billing` exists, everyone reads as free and planning keeps working, so a deploy that lands before its schema change doesn't take the planner down.

## Options considered

### Option A: Stripe Checkout and the billing portal over REST (chosen)

**Pros:** no card data or PCI scope; cancel, card updates, receipts and failed-payment retries come from Stripe; three env vars and two routes. **Cons:** the person leaves the app twice (to pay, to manage), and the portal's look is Stripe's.

### Option B: Stripe Elements or Payment Element inside Settings

**Pros:** the person stays in the app. **Cons:** a client-side Stripe.js load, payment-intent and 3-D Secure handling in our code, and our own cancel, card-update and invoice screens.

### Option C: a merchant of record (Paddle, Lemon Squeezy)

**Pros:** they handle sales tax and VAT. **Cons:** higher fees on a $4.99 plan, another vendor account and dashboard, and their webhooks and checkout flow to learn for a single price.

### Option D: the official `stripe` Node SDK

**Pros:** typed objects and built-in signature verification. **Cons:** a large dependency for the five endpoints used; the pinned version and a few typed fields in `billing.ts` cover them.

## Consequences

- Production order: apply `schema.sql` (it adds `premium_billing`), run the setup script against live mode, push the three secrets, then merge. README → "Stripe Premium" has the commands.
- Sandbox and live are separate everywhere: `.env` pairs a sandbox key with the dev branch, `.env.prod` the live key with production.
- Renewals, failed payments and period-end cancellations reach the app only through the webhook. Stripe retries a failed delivery for three days. The app has no periodic reconciliation.
- At full use, a Premium month costs about $3.50 in upstream spend against $4.99, before Stripe's fees (about $0.44 on a US card). Revisit the price or the allowance if the margin turns negative.
- No tax collection yet. Turning on Stripe Tax later is a Checkout parameter (`automatic_tax[enabled]`) plus Dashboard setup, not a redesign.
