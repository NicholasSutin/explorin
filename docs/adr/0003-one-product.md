# ADR-0003: Explorin is one product; the profile flow is part of it

**Status:** Accepted (supersedes the "keep isolated, decide later" proposal of the same day)
**Date:** 2026-10-11
**Deciders:** Nick Sutin

## Context

`apps/web` grew two surfaces with one codebase:

- **Discovery** at `/`: stateless server pipeline (Nimble → Gemini → Places), history in the browser. Needs only `GEMINI_API_KEY` and `NIMBLE_API_KEY` for live mode, nothing for the demo set.
- **Taste profile** at `/onboarding`, `/ask`, `/go`, `/reflect`, `/profile`: photo-based profile, pgvector retrieval over reflections ("what" the asker wants and "who" wrote the reflection), three composed cards, post-outing reflection that updates the profile. Needs Postgres with pgvector and photo storage.

The second surface carried the internal working name "Felt" in its package name, Worker name, bucket, page titles, header and storage keys. Nothing in the discovery UI linked to it. The product decision on 2026-10-11: the whole app is Explorin, the profile side is not legacy, and "people like you" is the differentiator.

## Decision

1. **One name.** Every "Felt" identifier becomes Explorin: `@explorin/web`, Worker `explorin-app` (app.explorin.app), bucket `explorin-photos`, titles, header, `explorin.*` storage keys. Prose and docs stop calling the profile flow "legacy".
2. **One navigation.** The discovery header links to "People like you" (`/onboarding`, which forwards to `/ask` when a profile exists); the profile side's header carries the Explorin lockup and an "Explore" tab back to `/`. Route groups are `(profile)` and `(flow)`.
3. **One retrieval, used by both.** The two-axis pgvector retrieval behind `/api/recommend` now also runs inside `/api/discover` as a `people` step, attaching up to two first-person quotes to each discovered place when the database is configured ([ADR-0005](0005-people-like-you-in-discovery.md)). Discovery still works, and says so, without a database.

## Options considered

### Option A: keep two unlinked flows under one name

| Dimension | Assessment |
|---|---|
| Complexity | Lowest now |
| Cost | The differentiator stays invisible to anyone who opens `/` |
| Scalability | Unaffected |
| Team familiarity | High |

**Pros:** no new code paths. **Cons:** two products in one app; the evidence idea only reachable by URL.

### Option B: delete the profile flow

**Pros:** fewer files, no Postgres. **Cons:** removes the thing that makes Explorin different.

### Option C: one product, evidence flows into discovery (chosen)

| Dimension | Assessment |
|---|---|
| Complexity | Medium: one new server module, one pipeline step, one card section |
| Cost | One embedding call and one indexed query per discovery run when the database is on |
| Scalability | Same query shape as the profile flow; scoped to a handful of place names |
| Team familiarity | Reuses the retrieval that already exists |

**Pros:** the differentiator shows up on the first screen; both surfaces share one retrieval and one data model; the profile side becomes the way to make discovery more personal rather than a parallel app. **Cons:** discovery gains an optional database dependency; place matching is by name until discovered places are upserted with their Google place IDs.

## Trade-off analysis

C costs a small amount of code and makes the product story coherent on the main surface. A and B are cheaper but either hide or discard the differentiator. The database remains optional, so the credential-free demo and the Workers deploy without Postgres both keep working.

## Consequences

- Easier: explaining the product; growing the profile side (every reflection written after an adventure improves discovery for everyone like that person).
- Harder: changes to the retrieval query or the `reflections` schema now affect both surfaces; test both.
- Revisit: when discovered places are stored, switch matching from names to `google_place_id` (ADR-0005 step 2); when a second city appears, lift the profile flow's `CITY` constant.

## Action items

1. [x] Rebrand identifiers, titles, header and storage keys (2026-10-11).
2. [x] Link the two surfaces in both headers; rename route group `(app)` to `(profile)`.
3. [x] Add the `people` step to discovery (ADR-0005 step 1).
4. [x] `explorin-photos` bucket created (2026-10-11). Secrets still need `npx wrangler secret put` on the `explorin-app` Worker before the first deploy under the new name (ADR-0004).
