# ADR-0010: Postgres on Neon, one branch per environment

**Status:** Accepted (production cutover pending, see "Cutover")
**Date:** 2026-11-07
**Deciders:** Nick Sutin

## Context

The database has been a Tiger Cloud service (`vhare1wvl4`, Postgres 18 with TimescaleDB). The app never used TimescaleDB: there are no hypertables, and the only extension it needs is `vector`. The bigger problem was that local development, production and Hyperdrive all pointed at that one service. Every `npm run db:migrate`, e2e run and QA session touched production ([ADR-0009](0009-versioned-migrations.md)), and rehearsals needed a billed Tiger fork each time.

Neon gives serverless Postgres 18 with pgvector, scale to zero, and copy-on-write branches. It also offers Managed Auth, an AI Gateway and Realtime on the same project.

## Decision

**Postgres moves to the Neon project `explorin` (`late-surf-27115355`, aws-us-east-1).** Each environment gets its own branch:

| Branch        | Used by                                                        | Notes                                                                         |
| ------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `production`  | the Worker (through Hyperdrive), `npm run db:migrate:prod`     | Default branch. Not protected: the Free plan has none.                        |
| `dev`         | `apps/web/.env` and `.dev.vars`, `npm run db:migrate`, e2e, QA | Child of production, no TTL. Refresh with `neon branches reset dev --parent`. |
| anything else | rehearsals, one-off experiments                                | Created with a 7-day TTL by the `neon.ts` policy.                             |

- **Driver unchanged.** The app keeps postgres.js (Neon's guidance is to keep the existing driver). On Workers it keeps Hyperdrive, now configured with the branch's **direct** host, because Hyperdrive is already the pool. The dev server uses the `-pooler` host; `prepare: false` already suits PgBouncer's transaction mode.
- **Scripts use the direct host.** `scripts/_shared.ts` prefers `DATABASE_URL_UNPOOLED`. `migrate.ts` refuses a pooler host, because its session advisory lock and the BEGIN/COMMIT on one reserved connection don't hold together behind PgBouncer.
- **`neon.ts` is the branch policy.** `neon env pull` writes `DATABASE_URL`, `DATABASE_URL_UNPOOLED` and the `NEON_*` variables into `.env` and leaves every other key alone. `.neon`, the pinned branch, is gitignored.
- **Rehearsals are branches, not forks.** `neon branches create --name rehearse-x --parent production` is instant and expires on its own. This replaces the Tiger-fork step in ADR-0009.
- **Data copy:** `npm run db:copy -- --from <env> --to <env> [--apply] [--replace]` (`scripts/copy-db.ts`). It copies the `public` schema and `vector` with pg_dump/pg_restore 18, in one transaction, then checks row counts table by table.

### Neon services the app does not adopt now

- **Managed Auth: not used.** `auth: false` in `neon.ts`. Identity stays on the app's own better-auth ([ADR-0007](0007-sign-in-first-single-flow.md)). It depends on the Turnstile captcha plugin, Resend mail from hello@explorin.app, the Cloudflare rate-limit bindings and custom user fields. Managed Auth's client takes a fixed plugin list, so moving would mean re-importing every account and rebuilding those protections. Neon's own guidance agrees: keep a working Better Auth. The console had already enabled Managed Auth on the branches. Its `neon_auth` schema is empty and separate from `public."user"`, and with `search_path` = `"$user", public` the app can't hit it by accident. To remove it entirely: `neon neon-auth` in the console or CLI (optional).
- **AI Gateway: wired, off by default.** `AI_GATEWAY=neon` sends Gemini _generation_ to the branch gateway's native Gemini route: same `@google/genai` SDK, a Bearer header, and dashed model ids such as `gemini-3-8-flash`. Embeddings always stay on Google AI Studio. The gateway has no Gemini embedding model, and every stored vector is `gemini-embedding-2` at 768 dimensions. Until the Neon org buys AI Gateway credits, every gateway call answers `403 paid_plan_required`.
- **Realtime: declared, unused.** No page reads database rows live today, and the planner's progress panel streams model output, not rows. Trips syncing across devices is the obvious first live query, if that becomes wanted.

## Options considered

- **Stay on Tiger.** Changes nothing, but keeps one shared database and billed forks.
- **Neon with `@neondatabase/serverless`.** An HTTP/WebSocket driver built for edge runtimes. Rejected because Hyperdrive and postgres.js already work on Workers, and changing the driver would touch Kysely/better-auth's `reserve()` path for no gain.
- **Neon with Managed Auth.** Rejected above.

## Consequences

- Local work no longer touches production. `npm run db:migrate` targets `dev`; production migrations are `npm run db:migrate:prod`, which reads `.env.prod`.
- The release plan in `docs/plans/finish-vision-revamp.md` runs unchanged on Neon. The copied database reports the same pending `0001`–`0003` as Tiger did. All three steps (`--through 0000`, `--through 0002`, then all) were rehearsed on `dev` on 2026-11-07, with the journey e2e passing after the first and the last.
- Scale to zero: an idle compute sleeps after 5 minutes (not configurable on Free), so the first request after a quiet spell pays a cold start of a few hundred ms.
- Neon's `max_connections` is 901 at this size, far above Hyperdrive's pool.

## Cutover

The production branch holds a copy of Tiger taken on 2026-11-07 (15 tables, row counts and schema verified identical). The live site still reads Tiger until these steps run, in this order (minutes, no code deploy):

1. Refresh the copy: `npm run db:copy -- --from .env.tiger --to <production env> --apply --replace`, where the production env file has the production branch's `DATABASE_URL_UNPOOLED`. Writes to Tiger between this and step 2 are lost, so run them back to back.
2. Point Hyperdrive at Neon: `npx wrangler hyperdrive update 95a3d14afca04acbb1274df67aff62eb --connection-string="<production DATABASE_URL_UNPOOLED>"`. The deployed Worker switches on its next connection.
3. Update `.env.prod` (`neon env pull --branch production --service postgres --file .env.prod`), then `npm run secrets:web:update` so the `DATABASE_URL` fallback secret matches.
4. Check app.explorin.app (sign-in, a trip page) and `npx wrangler tail`.

**Rollback:** step 2 again with the Tiger connection string from `.env.tiger`. Keep the Tiger service until a week has passed without needing it, then delete it.
