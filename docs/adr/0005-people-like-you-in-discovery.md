# ADR-0005: "People like you" quotes inside discovery

**Status:** Accepted (step 1 implemented; step 2 planned)
**Date:** 2026-10-11
**Deciders:** Nick Sutin

## Context

Discovery (`/api/discover`) finds places from the open web and verifies them with Google Places. The profile side already holds first-person reflections with two embeddings each: the body of the reflection and the author's taste profile. Retrieval there scores a quote as `0.6·sim(prompt, body) + 0.4·sim(asker profile, author profile) + 0.05 if first-party`. That is the "people like you" idea, and it was only visible at `/ask`.

## Decision

Add a `people` step to the discovery pipeline, after Places enrichment:

- `lib/server/evidence.ts` embeds the prompt, loads the asker's profile embedding if the cookie user has one, and runs the same two-axis score over `reflections` joined to `places`, restricted to the place names the run produced (name containment both ways, punctuation-insensitive). Up to two quotes attach to each experience as `voices`.
- The step reports like every other stage: skipped without a database or Gemini key, skipped with "Nobody like you has written about these places yet" when nothing matches, failed (and ignored) on an error. Discovery never depends on it.
- The card shows the quotes under "How it felt for people like you" with the author label and source, styled in the brand's moss tint so they read differently from Google reviews.

### Step 2 (not yet built)

Upsert discovered places into `places` with their `google_place_id` during enrichment, and match on that ID instead of name. Then a reflection written after any discovered adventure (via `/reflect`) becomes evidence for the next person, closing the loop between the two surfaces.

## Options considered

### Option A: name-scoped retrieval inside discovery (chosen for step 1)

| Dimension | Assessment |
|---|---|
| Complexity | Low: ~80 lines, no schema change |
| Cost | One embedding call plus one query per run with the database on |
| Scalability | Query is bounded by place names, not table size |
| Team familiarity | Same SQL shape as `recommend.ts` |

**Pros:** ships today; works for the curated set and the demo places, which overlap. **Cons:** name matching misses places that are not in `places` yet, and could match a same-named place elsewhere once cities multiply.

### Option B: place-ID join after upserting discovered places (step 2)

**Pros:** exact; makes every adventure's reflection reusable. **Cons:** writes to `places` from the discovery path, so discovery would need the database for that write (it can stay optional); needs the reflect flow to accept discovered experiences.

### Option C: a separate "people like you" endpoint the UI calls after results arrive

**Pros:** discovery stays database-free in code. **Cons:** a second round trip and a second place to explain in the pipeline panel; the step belongs in the same stream.

## Trade-off analysis

A is the smallest change that puts the differentiator on the main screen, and it is a strict subset of B: step 2 replaces the `WHERE` clause and adds an upsert, nothing else moves.

## Consequences

- Easier: demoing the idea from `/`; reasoning about one retrieval function.
- Harder: `reflections` and `places` are now read by discovery, so schema migrations must keep both callers in mind.
- Revisit: step 2 when the reflect flow is opened to discovered experiences; the `0.6/0.4` weights once there is enough first-party data to tune them.

## Action items

1. [x] `evidence.ts`, `people` step, `voices` on `Experience`, card section (2026-10-11).
2. [ ] Step 2: upsert discovered places by `google_place_id` and match on it.
3. [ ] Let `/reflect` accept a discovered experience so reflections from `/` feed the table.
