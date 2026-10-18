/**
 * Database migrations (ADR-0009). Dry run by default: prints the target and what would run.
 *
 *   npm run db:migrate                 # dry run
 *   npm run db:migrate -- --apply      # apply
 *
 * 1. schema.sql is the whole current shape, written to be idempotent, and is applied on every run.
 * 2. migrations/NNNN-name.sql holds what schema.sql cannot say (backfills, drops). Each runs once, in name order,
 *    in its own transaction together with its schema_migrations row.
 *
 * A brand-new database gets schema.sql and has every migration recorded as already applied, since schema.sql is
 * their end result. A run refuses to start when the database has applied a migration this checkout lacks: an
 * older branch's schema.sql would re-create what that migration dropped.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { env, sql } from './_shared';

const apply = process.argv.includes('--apply');
const dir = new URL('./migrations/', import.meta.url);
const migrations = readdirSync(dir)
	.filter((f) => /^\d{4}-[a-z0-9-]+\.sql$/.test(f))
	.sort();
const schema = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');

const target = new URL(env('DATABASE_URL'));
console.log(`database: ${target.hostname}${target.pathname}${apply ? '' : '  (dry run)'}`);

// One reserved connection for the whole run, so the advisory lock and each BEGIN/COMMIT share a session.
const db = await sql.reserve();
let failed = false;
try {
	if (apply) await db`SELECT pg_advisory_lock(hashtext('explorin.migrate'))`;
	const [state] = await db<{ fresh: boolean; tracked: boolean }[]>`
		SELECT to_regclass('public."user"') IS NULL AS fresh,
		       to_regclass('public.schema_migrations') IS NOT NULL AS tracked`;
	const applied = state.tracked
		? (await db<{ name: string }[]>`SELECT name FROM schema_migrations`).map((r) => r.name)
		: [];
	const unknown = applied.filter((name) => !migrations.includes(name));
	if (unknown.length)
		throw new Error(
			`the database has applied ${unknown.join(', ')}, which this checkout does not have. Update the checkout first.`
		);
	const pending = state.fresh ? [] : migrations.filter((m) => !applied.includes(m));

	if (state.fresh)
		console.log(
			`new database: schema.sql, then ${migrations.length} migration(s) recorded as baseline`
		);
	else
		console.log(
			`schema.sql (idempotent)\npending: ${pending.length ? pending.join(', ') : 'none'}`
		);
	if (!apply) {
		console.log('nothing changed; pass --apply to run it');
	} else {
		await db.unsafe(schema);
		await db`CREATE TABLE IF NOT EXISTS schema_migrations (
			name text PRIMARY KEY,
			applied_at timestamptz NOT NULL DEFAULT now()
		)`;
		console.log('schema.sql applied');
		if (state.fresh && migrations.length)
			await db`INSERT INTO schema_migrations ${db(migrations.map((name) => ({ name })))}
			         ON CONFLICT (name) DO NOTHING`;
		for (const name of pending) {
			await db.unsafe('BEGIN');
			try {
				await db.unsafe(readFileSync(new URL(name, dir), 'utf8'));
				await db`INSERT INTO schema_migrations (name) VALUES (${name})`;
				await db.unsafe('COMMIT');
			} catch (e) {
				await db.unsafe('ROLLBACK');
				throw new Error(`${name} failed and was rolled back: ${(e as Error).message}`);
			}
			console.log(`applied ${name}`);
		}
	}
} catch (e) {
	failed = true;
	console.error(`migrate: ${(e as Error).message}`);
} finally {
	db.release();
	await sql.end(); // closing the session also releases the advisory lock
}
if (failed) process.exit(1);
