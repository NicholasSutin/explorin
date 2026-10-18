# ADR-0001: One repository, npm workspaces for apps and packages

**Status:** Accepted
**Date:** 2026-10-11
**Deciders:** Nick Sutin

## Context

The hackathon repo grew as a single SvelteKit app (then in a `felt/` folder) with brand assets, marketing photos, planning docs and render output scattered at the root. A marketing site is coming, the brand kit is shared by both, and the app should stay deployable on its own.

## Decision

Reorganise into `apps/web`, `apps/marketing`, `packages/brand`, `docs/`, `media/` with a root `package.json` declaring `apps/*` and `packages/*` as npm workspaces. Each app keeps its own scripts; the root forwards the common ones (`dev:web`, `build:web`, `build:marketing`, `check:web`, `test:web`, `deploy:web`).

## Options considered

### Option A: npm workspaces monorepo (chosen)

| Dimension        | Assessment                                                                            |
| ---------------- | ------------------------------------------------------------------------------------- |
| Complexity       | Low: one `package.json` field, no extra tooling                                       |
| Cost             | None                                                                                  |
| Scalability      | Fine for a handful of apps; Turborepo or pnpm can be added later without moving files |
| Team familiarity | npm is already in use                                                                 |

**Pros:** one checkout, one history, brand assets next to their consumers, shared agent skills and MCP config at the root.
**Cons:** `npm install` at the root hoists dependencies and creates a root lockfile, making `apps/web/package-lock.json` stale; mixed concerns in one repo.

### Option B: separate repositories

| Dimension        | Assessment                                      |
| ---------------- | ----------------------------------------------- |
| Complexity       | Medium: brand kit must be published or vendored |
| Cost             | More CI and permission surface                  |
| Scalability      | Scales to many teams, which this is not         |
| Team familiarity | Fine                                            |

**Pros:** independent release cadence, smaller clones.
**Cons:** brand drift between repos, two places to update docs and skills, overhead for a single developer.

### Option C: keep everything in one app (marketing as routes of the web app)

**Pros:** nothing to set up.
**Cons:** the landing page would ship the app's JavaScript and depend on its environment; cannot be hosted on a static CDN; mixes deploy risk.

## Trade-off analysis

For one developer with one product and one brand, the cost of a second repo is pure overhead. Workspaces give the separation that matters (each app builds and deploys alone) without new tooling.

## Consequences

- Easier: moving files between apps, sharing `packages/brand`, running everything from the root.
- Harder: nothing material. Install from the root once so the root lockfile becomes the source of truth, then delete `apps/web/package-lock.json`.
- Revisit: add Turborepo only if build times or cross-app dependencies become a problem.

## Action items

1. [x] Move files and add the root `package.json` (commit `6297edd`).
2. [x] Run `npm install` at the root once and remove `apps/web/package-lock.json` (root lockfile is the source of truth; web deps stay nested under `apps/web/node_modules`).
