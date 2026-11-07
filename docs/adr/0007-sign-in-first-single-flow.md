# ADR-0007: Sign-in first, one flow from taste to scrapbook

**Status:** Accepted
**Date:** 2026-10-17
**Deciders:** Nick Sutin
**Supersedes:** the guest demo and the separate profile side described in ADR-0003 and ADR-0005

## Context

The hackathon build had two products in one app. `/` was a guest single-page flow (discover, adventure, scrapbook) that kept everything in `localStorage`; the profile side (`/onboarding/photos`, `/ask`, `/go`, `/reflect`, `/profile`) needed an account, built a taste profile from photos, and stored everything in Postgres. Each had its own adventure and reflection steps and its own idea of a profile, and saved onboarding answers were never read by discovery.

The product we want is one path: sign up, describe what you like, grade a short tier list, plan a day, walk it on a map, reflect, keep it in a scrapbook, manage it all in settings.

## Decision

- **Every page needs an account** except `/welcome` and the account pages (`hooks.server.ts`, `PUBLIC`). Guests reaching `/` land on `/welcome`; APIs answer 401. The anonymous `uid` cookie is gone.
- **Onboarding is two steps** and must finish before anything else opens: `/onboarding` (name, home city, a free-text blurb, interests, who they plan for) and `/onboarding/taste` (a tier list, S+ to NO). `onboardedAt` is set when the tier list is saved.
- **The taste profile is the `taste` table**: blurb, interests, audience, grades, and a deterministic plain-language summary (`tasteSummary`) with its embedding. The planner prompt reads the summary; "people like you" weighting uses the embedding. The photo profile (`profiles`) is no longer written.
- **Trips live in Postgres** (`trips`, `trip_stops`), not the browser, so the scrapbook follows the account across devices. Photos go to R2 under `<user id>/`, served only to their owner.
- **Usage is metered per person** (`usage_events`, priced in `pricing.ts`) and plans stop at `MONTHLY_CREDITS`.
- The old routes and modules moved to `apps/web/legacy/` (not built or checked) rather than being deleted. They were removed on 2026-10-17, in the same release as `scripts/migrations/0001-legacy-taste.sql`, which moves the old accounts onto the taste profile; git history has them.

## Options considered

### Option A: keep the guest flow and add accounts beside it

**Pros:** demo needs no sign-up. **Cons:** two of everything forever; anonymous usage can't be metered or capped, which matters once AI and Maps calls cost money.

### Option B: sign-in first, one flow (chosen)

**Pros:** one adventure model, one reflection model, one profile; usage is attributable; scrapbooks survive a new phone. **Cons:** a demo needs an account (the e2e test signs up from scratch in ~30 s).

## Consequences

- Easier: every server call knows who it is for, so personalisation, quotas and deletion are straightforward.
- Harder: no zero-friction demo. A future "try it" path would need its own credit budget.
- Account deletion (`account.ts`) must keep up with every new table that holds personal data; new tables should hang off `users(id) ON DELETE CASCADE` as the v1 ones do.
