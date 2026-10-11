# ADR-0004: adapter-node by default, Cloudflare Workers behind a build flag

**Status:** Accepted
**Date:** 2026-10-11
**Deciders:** Nick Sutin

## Context

The web app must run locally with hot reload, be demoable on a laptop or any Node host, and be deployable to Cloudflare Workers where the R2 photo bucket lives. SvelteKit adapters are chosen at build time, and the photo storage API differs between local disk and R2.

## Decision

`vite.config.ts` picks the adapter from `DEPLOY_TARGET`: unset → `adapter-node` and `storage.local.ts`; `cloudflare` → `adapter-cloudflare` and `storage.r2.ts`. The two storage modules share one signature (`putPhoto`, `getPhoto`) and are wired through the `#storage` alias, so no runtime code branches on platform. Environment variables are declared once in `src/env.ts` with `defineEnvVars`, which supplies defaults on both targets; `wrangler.jsonc` holds only bindings and secrets.

## Options considered

### Option A: build-time target switch (chosen)

| Dimension | Assessment |
|---|---|
| Complexity | Low: one env var, one alias |
| Cost | Two adapters as dev dependencies |
| Scalability | Workers scale per request; Node scales per process |
| Team familiarity | Both already in use |

**Pros:** `npm run dev` needs no Cloudflare tooling; the production path is exercised by `npm run preview:cf`; platform differences are confined to two small files.
**Cons:** two code paths to test; a Node-only module (`node:fs` in `personas.ts`) must guard itself when built for Workers.

### Option B: Cloudflare only

**Pros:** one target, R2 and observability built in, `wrangler dev` for local.
**Cons:** slower inner loop than Vite HMR; the HEIC worker and `html-to-image` export were easier to debug on Node; the demo would depend on connectivity.

### Option C: Node only, photos on disk or S3

**Pros:** simplest possible runtime.
**Cons:** loses the edge deploy that was already working; would need a new object store.

## Trade-off analysis

The real cost of A is the second code path, and it is kept to two files. Everything else (caches, routes, pipelines) is platform-neutral by construction: upstream calls use `fetch` with `AbortSignal.timeout`, and no module touches `process` outside `vite.config.ts`, the persona loader and `storage.local.ts` (which only the Node build includes).

## Consequences

- Easier: local development and demos; moving the Explorin flow to Workers (it has no database dependency).
- Harder: background work after the response (`enrichWithMaps`, live refresh) is fire-and-forget, which Workers may cancel; use `platform.context.waitUntil` before deploying the legacy flow there.
- Revisit: if Workers becomes the only production target, delete `adapter-node` and `storage.local.ts`; if in-process caches prove cold too often across isolates, add the Cache API in `/api/map` and `/api/photo`.

## Action items

1. [x] Single env declaration in `src/env.ts`; duplicate `vars` removed from `wrangler.jsonc`.
2. [ ] Rename the Worker and package from `felt` to `explorin` when the deployed name can change (changes the Worker URL).
3. [ ] Wrap background promises in `waitUntil` for the Cloudflare build.
