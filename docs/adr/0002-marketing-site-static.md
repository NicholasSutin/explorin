# ADR-0002: The marketing site is static HTML with no build dependencies

**Status:** Accepted
**Date:** 2026-10-11
**Deciders:** Nick Sutin

## Context

Explorin needs a public landing page: what it is, a few postcards, and a link into the app. The web app's `/` route already carries a hero and landing copy, but it is also the app itself: it loads the discovery UI, the HEIC decoder and the scrapbook exporter, and it depends on the app's environment. The marketing site should be hostable on any static CDN, change independently of the app, and reuse the brand kit in `packages/brand`.

## Decision

`apps/marketing` is a static site: `public/index.html` plus `public/styles.css`, with brand assets copied in from `packages/brand` by a small sync script at build time. No framework, no runtime dependencies. The site links to the app with a single CTA.

## Options considered

### Option A: static HTML and CSS, brand synced from the package (chosen)

| Dimension | Assessment |
|---|---|
| Complexity | Low: two files and a copy step |
| Cost | Free on any static host (Cloudflare Pages, Netlify, GitHub Pages) |
| Scalability | A CDN serves it; content scales until there are many pages |
| Team familiarity | HTML and CSS; the brand tokens are already CSS variables |

**Pros:** zero dependencies and nothing to upgrade; builds in milliseconds; the whole page is readable in one file; no risk of the marketing deploy breaking the app or vice versa.
**Cons:** no components or templating; a second page means duplicated header and footer markup; no image pipeline, so photos must be pre-optimised (they already are, in `apps/web/static/marketing`).

### Option B: SvelteKit with `adapter-static`

| Dimension | Assessment |
|---|---|
| Complexity | Medium: another SvelteKit project, Vite config, deps to keep in step with `apps/web` |
| Cost | Free hosting, but a dependency tree to maintain |
| Scalability | Good: components, layouts, image optimisation plugins |
| Team familiarity | High: same stack as the app, Svelte skills are in the repo |

**Pros:** shared mental model with the app; components for repeated sections; could later import from a shared `packages/ui`.
**Cons:** the first version is one page, so the framework carries no weight; two SvelteKit apps in one workspace doubles install and upgrade churn; the root `npm install` would hoist and restructure `apps/web/node_modules`.

### Option C: Astro

**Pros:** built for content sites, Markdown-first, islands if needed.
**Cons:** a third toolchain in the repo for one page; same hoisting cost as B.

## Trade-off analysis

The deciding factor is what the site is today: one page. Options B and C pay their cost up front and earn it back only once there are several pages or shared components. Option A can be upgraded to B in an afternoon by moving the markup into a `+page.svelte`, and nothing about the brand package or hosting changes.

## Consequences

- Easier: deploy anywhere, edit copy without a build, keep the app's bundle free of marketing weight.
- Harder: adding a second page duplicates the shell markup; adding a blog means revisiting this ADR.
- Revisit when any of these appear: more than three pages, a CMS, localisation, or a need to share components with the app.

## Action items

1. [x] Scaffold `apps/marketing/public/` with the landing page, `sync-brand` script and README.
2. [x] Add `build:marketing` to the root scripts.
3. [ ] Point a static host at `apps/marketing/public` with build command `npm run build -w apps/marketing`.
4. [ ] Decide the production app URL for the CTA (`APP_URL` in `index.html`, currently a `/app` placeholder) and the site's own origin, so `og:image` and `og:url` can be absolute as Open Graph scrapers require.
