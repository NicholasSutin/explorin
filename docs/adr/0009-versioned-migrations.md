# ADR-0009: Versioned migrations next to the idempotent schema

**Status:** Accepted
**Date:** 2026-10-17
**Deciders:** Nick Sutin

## Context

Until now `npm run db:migrate` applied `apps/web/scripts/schema.sql`, written so it can run again any time (`CREATE … IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`). That covers adding things, but not backfills or drops. [system-design.md](../system-design.md) §5 said to bring in a migration tool at the first destructive change. Retiring the pre-v1 tables (`profiles`, `experiences`, `response_cache`) and moving the old accounts onto the taste profile are that change.

Two constraints shape it. Local development, production and Hyperdrive share one Tiger database, so any run touches production. And a migration that drops a table only works if no older checkout re-creates that table on its next run.

## Decision

`scripts/migrate.ts`, about 80 lines on the existing postgres.js client, with no new dependency.

- **Dry run by default.** It prints the database host and the pending migrations. Only `npm run db:migrate -- --apply` changes anything.
- **Two layers:**
  - `schema.sql` is the whole current shape and is applied first on every run.
  - `scripts/migrations/NNNN-name.sql` holds only what `schema.sql` can't say: backfills, data fixes and drops. Each file runs once, in name order, inside its own transaction together with its `schema_migrations` row. Migration files therefore contain no `BEGIN`/`COMMIT` and no `CREATE INDEX CONCURRENTLY`.
- **New database.** The runner checks for `"user"` before it applies `schema.sql`. If that table is missing, it applies `schema.sql` and records every migration as already applied without running it. `schema.sql` is already their combined result, so no migration needs a guard for an empty database.
- **Unknown migration means a hard stop.** If the database records a migration that the checkout lacks, the runner exits before touching anything. This keeps an older branch's `schema.sql` from re-creating dropped tables.
- **Overlapping runs are serialised** with `pg_advisory_lock` on one reserved connection.
- **Rules for writing changes:**
  - `schema.sql` must apply cleanly to any database that has every earlier migration. A new column on an existing table therefore goes in its `CREATE TABLE` and in an `ALTER TABLE … ADD COLUMN IF NOT EXISTS` beside it.
  - A drop is two steps. First deploy code that no longer uses the object, together with a `schema.sql` that no longer creates it. Then add the migration that drops it.

## Options considered

### Option A: keep only `schema.sql`

**Pros:** nothing new. **Cons:**
- Drops and backfills would have to be idempotent statements that run on every deploy forever.
- An old checkout silently re-creates dropped tables.

### Option B: a migration tool (node-pg-migrate, Atlas, Prisma Migrate, Drizzle Kit)

**Pros:** down-migrations and a familiar CLI. **Cons:**
- Each one is a new dependency, and most would also take over schema definition.
- Baselining the existing database needs a manual step on the one database that production depends on.
- Down-migrations don't undo a dropped table's data anyway. A Tiger fork taken beforehand does.

### Option C: idempotent schema plus a small runner (chosen)

**Pros:**
- `schema.sql` stays the readable source of truth.
- The existing database is baselined by simply having no `schema_migrations` table.
- Dry runs and the refuse-unknown check fit a shared production database.

**Cons:** no down-migrations, so destructive steps are rehearsed on a Tiger fork first.

## Consequences

- Every destructive change gets a rehearsal on a fork of the Tiger service, and the fork is deleted afterwards because it is billed while it exists.
- `npm run setup` applies migrations (`db:migrate -- --apply && db:seed`).
- Timing matters while dev and production share a database: a migration whose effect the deployed code would undo waits until after the deploy (see `0001-legacy-taste.sql`).
