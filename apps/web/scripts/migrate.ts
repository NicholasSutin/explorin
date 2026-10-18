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
 * older branch's schema.sql would re-create what that migration dropped. Every step waits at most LOCK_TIMEOUT for
 * a table lock, so a busy production table makes the run fail (retry it) instead of stalling the site behind it.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { env, sql } from './_shared';

const LOCK_TIMEOUT = '5s';
const NAME = /^(\d{4})-[a-z0-9-]+\.sql$/;

const apply = process.argv.includes('--apply');
const dir = new URL('./migrations/', import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith('.sql'));
const misnamed = files.filter((f) => !NAME.test(f));
if (misnamed.length) fail(`rename ${misnamed.join(', ')} to NNNN-lowercase-words.sql`);
const migrations = files.sort();
const numbers = migrations.map((f) => f.slice(0, 4));
const dupes = numbers.filter((n, i) => numbers.indexOf(n) !== i);
if (dupes.length) fail(`two migrations share the number ${[...new Set(dupes)].join(', ')}`);
const schema = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');

// Parsed here (not only by postgres.js) so a malformed URL is reported without echoing its password.
let target: URL;
try {
	target = new URL(env('DATABASE_URL'));
} catch {
	fail('DATABASE_URL is not a valid URL (percent-encode special characters in the password)');
}
console.log(`database: ${target.hostname}${target.pathname}${apply ? '' : '  (dry run)'}`);

// One reserved connection for the whole run, so the advisory lock and each BEGIN/COMMIT share a session.
const db = await sql.reserve();
let failed = false;

/** Run `body` in one transaction on the reserved connection, with the lock timeout set. */
async function inTransaction(label: string, body: () => Promise<unknown>) {
	await db.unsafe('BEGIN');
	try {
		await db.unsafe(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);
		await body();
		await db.unsafe('COMMIT');
	} catch (e) {
		await db.unsafe('ROLLBACK').catch(() => {}); // a dropped connection must not hide the real error
		const err = e as Error & { code?: string };
		const why =
			err.code === '55P03'
				? `waited over ${LOCK_TIMEOUT} for a table lock (something is using it); run again`
				: err.message;
		throw new Error(`${label} failed and was rolled back: ${why}`);
	}
}

try {
	if (apply) await db`SELECT pg_advisory_lock(hashtext('explorin.migrate'))`;
	// `users` is in every version of schema.sql, so its absence means nothing has ever been applied here.
	const [state] = await db<{ fresh: boolean; tracked: boolean }[]>`
		SELECT to_regclass('public.users') IS NULL AS fresh,
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
		// schema.sql and, on a new database, the baseline commit together: a half-done first run must not leave
		// a database that looks existing but has none of its migrations recorded.
		await inTransaction('schema.sql', async () => {
			await db.unsafe(schema);
			await db`CREATE TABLE IF NOT EXISTS schema_migrations (
				name text PRIMARY KEY,
				applied_at timestamptz NOT NULL DEFAULT now()
			)`;
			if (state.fresh && migrations.length)
				await db`INSERT INTO schema_migrations ${db(migrations.map((name) => ({ name })))}
				         ON CONFLICT (name) DO NOTHING`;
		});
		console.log('schema.sql applied');
		for (const name of pending) {
			await inTransaction(name, async () => {
				await db.unsafe(readFileSync(new URL(name, dir), 'utf8'));
				await db`INSERT INTO schema_migrations (name) VALUES (${name})`;
			});
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

function fail(message: string): never {
	console.error(`migrate: ${message}`);
	process.exit(1);
}
