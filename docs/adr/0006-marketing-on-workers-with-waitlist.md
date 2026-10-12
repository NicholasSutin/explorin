# ADR-0006: The marketing site runs on SvelteKit + Cloudflare Workers with a D1 waitlist

**Status:** Accepted (supersedes [ADR-0002](0002-marketing-site-static.md))
**Date:** 2026-10-11
**Deciders:** Nick Sutin

## Context

ADR-0002 chose a zero-dependency static page because the site was one page with no behaviour. The same day the requirement changed: the site needs a waitlist, which means a server endpoint and storage, and it should run as a Worker like the app. The candidates named were SvelteKit and Astro.

## Decision

`apps/marketing` is a SvelteKit app built with `adapter-cloudflare`, deployed as the Worker `explorin-marketing`. The waitlist is a SvelteKit form action (`?/join`) writing to a D1 database bound as `WAITLIST`, with the schema under `migrations/`. Brand assets are still synced from `packages/brand` at build time.

## Options considered

### Option A: SvelteKit + adapter-cloudflare + D1 (chosen)

| Dimension | Assessment |
|---|---|
| Complexity | Low for this repo: identical toolchain and versions to `apps/web` |
| Cost | Workers free tier; D1 free tier covers a waitlist many times over |
| Scalability | Edge-served; D1 is single-region but a waitlist is write-light |
| Team familiarity | Highest: Svelte 5 runes and Kit 3 are already in use, Svelte skills live in the repo |

**Pros:** one framework to know; form actions give a waitlist that works without JavaScript and is enhanced with it; `wrangler types` types the bindings; moving components between the two apps is trivial later.
**Cons:** a second Kit app to keep on the same versions; Kit's client runtime ships on a page that barely needs it (small, and the form works without it anyway).

### Option B: Astro + Cloudflare adapter + D1

| Dimension | Assessment |
|---|---|
| Complexity | Medium: a third toolchain in the repo |
| Cost | Same |
| Scalability | Same |
| Team familiarity | Lower; Astro's islands and content collections are new to this codebase |

**Pros:** built for content sites, zero JS by default, Markdown pages for free. **Cons:** a different mental model from the app; sharing components later means rewriting them; no form-action equivalent, so the waitlist is a hand-rolled endpoint.

### Option C: keep the static page and add a Worker just for the waitlist

**Pros:** smallest change. **Cons:** two deployables for one site, CORS or same-domain routing to arrange, and the page still cannot render anything dynamic.

### Storage: D1 over KV

D1 gives a unique constraint on email, a count, ordering by signup time and a one-command export. KV would need a key per email and a list scan to export. Both are free at this size; D1 is the one that behaves like a list.

## Trade-off analysis

A and B both satisfy the requirement; A wins on the only dimension that differs materially for one developer, which is not learning and maintaining a second framework. The static option is retired because the site now has behaviour.

## Consequences

- Easier: adding pages, sharing brand components with the app, reading the waitlist.
- Harder: the site now needs `npm install` and a Worker deploy; the D1 database must exist before the first deploy.
- Revisit: add Turnstile if bots get past the honeypot; move `APP_URL` to a per-environment var once staging exists.

## Action items

1. [x] Scaffold the Kit app, form action, D1 binding, migration and brand sync (2026-10-11).
2. [ ] `npx wrangler d1 create explorin-waitlist`, paste the id into `wrangler.jsonc`, `npm run db:migrate -w apps/marketing`.
3. [ ] `npm run deploy -w apps/marketing`, then make `og:image` absolute with the site origin.
