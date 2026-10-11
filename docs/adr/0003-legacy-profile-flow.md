# ADR-0003: The profile-based "Felt" flow stays, isolated from the Explorin flow

**Status:** Proposed (needs a product decision)
**Date:** 2026-10-11
**Deciders:** Nick Sutin

## Context

`apps/web` contains two products with one codebase:

- **Explorin discovery** at `/`: stateless server pipeline (Nimble → Gemini → Places), history in the browser. Needs only `GEMINI_API_KEY` and `NIMBLE_API_KEY` for live mode, and nothing at all for the demo set.
- **Felt profile recommend** at `/onboarding`, `/ask`, `/go`, `/reflect`, `/profile`: photo-based taste profile, pgvector retrieval over reflections, three composed cards, post-outing reflection that updates the profile. Needs Postgres with pgvector, photo storage, and the seed/ingest scripts.

Nothing in the Explorin UI links to the Felt routes; they are reachable by URL only. The Felt flow accounts for roughly 2,100 lines across 35 files (routes, components, `recommend.ts`, `prompts.ts`, `profile.ts`, `reflect.ts`, `db.ts`, storage, scripts) and for the `postgres`, Tailwind and R2 dependencies. It is also where the "evidence from how people like you felt there" idea lives, which is central to the product story.

## Decision (proposed)

Keep the Felt flow for now, but isolated so that it cannot leak into the Explorin surface:

- Its pages live in route groups `(app)` (with the tab header) and `(flow)` (full-screen), each with its own layout; the root layout no longer special-cases paths.
- Only its routes (plus the `/api/demo` health counter) import `db.ts`, so the Explorin flow runs without `DATABASE_URL`.
- Its API routes share the same plumbing (`parseBody`, `error()`, `handleError`) as the rest, so there is one error contract.

Whether to remove it, merge its retrieval into discovery, or make it the product is a product call this ADR does not make.

## Options considered

### Option A: keep and isolate (proposed)

| Dimension | Assessment |
|---|---|
| Complexity | Low now; two flows to keep compiling |
| Cost | `npm run check` covers 2k lines nobody reaches; Postgres service to keep alive for scripts |
| Scalability | Unaffected |
| Team familiarity | High; it was the first build |

**Pros:** nothing lost; the evidence-retrieval idea stays runnable for the hackathon write-up and demo; reversible.
**Cons:** two Gemini prompt sets, two photo paths, two "api" wrappers in spirit even after dedup; new contributors must learn which flow a file belongs to.

### Option B: delete the Felt flow

**Pros:** ~35 fewer files, no Postgres, no Tailwind, no R2, no scripts; one product.
**Cons:** loses the "people like you" retrieval that gives Explorin its differentiator; irreversible without git archaeology.

### Option C: fold evidence retrieval into discovery

Keep `reflections` and pgvector, drop onboarding/profile pages, and have `/api/discover` attach one evidence quote per experience when a database is configured.

**Pros:** one UI, the strongest story.
**Cons:** real design work (profile without onboarding, consent, seeding), out of scope for a cleanup pass.

## Trade-off analysis

A and B are cheap to execute; C is the most valuable but not a cleanup. Choosing A now keeps B and C both open at the same cost as today, which is why it is proposed as the default until the product decision is made.

## Consequences

- Easier: the Explorin flow can be deployed without a database; the layouts no longer need a path deny-list.
- Harder: a change to shared server plumbing must be checked against both flows.
- Revisit: at the next product planning pass, choose B or C explicitly.

## Action items

1. [x] Move Felt pages into `(app)` and `(flow)` route groups with their own layouts.
2. [x] Route all API errors through one contract.
3. [ ] Decide B or C; if C, write ADR-0005 for evidence-in-discovery.
