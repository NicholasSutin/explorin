/**
 * Copy the app's Postgres data from one database to another: the Tiger → Neon move (ADR-0010), and any later
 * "start this branch from that database" copy. Dry run by default.
 *
 *   node --import tsx scripts/copy-db.ts --from .env.tiger --to .env.prod             # dry run: both sides' counts
 *   node --import tsx scripts/copy-db.ts --from .env.tiger --to .env.prod --apply     # copy into an empty target
 *   ... --apply --replace                                                             # drop the target's app tables first
 *
 * Each env file is read for DATABASE_URL_UNPOOLED, else DATABASE_URL. The target must be a direct connection (a
 * Neon `-pooler` host runs PgBouncer in transaction mode, which pg_restore can't use). Only the `public` schema and
 * the `vector` extension are copied: TimescaleDB, pg_stat_statements and pg_buffercache on Tiger are not used by the
 * app, and Managed Auth's `neon_auth` schema on Neon is left alone. The restore runs in one transaction, so a
 * failure leaves the target as it was (with --replace, the drop is part of that same transaction).
 *
 * Needs pg_dump / pg_restore 18 (`brew install libpq`; or set PG_BIN). Passwords go to the tools through
 * PGPASSWORD, never on the command line.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import postgres from 'postgres';

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const option = (name: string) => {
	const at = args.indexOf(name);
	return at === -1 ? undefined : args[at + 1];
};
const apply = flag('--apply');
const replace = flag('--replace');
const fromFile = option('--from');
const toFile = option('--to');
if (!fromFile || !toFile)
	fail('usage: copy-db.ts --from <env file> --to <env file> [--apply] [--replace]');

const source = readUrl(fromFile, 'source');
const target = readUrl(toFile, 'target');
if (source.host === target.host && source.pathname === target.pathname)
	fail('source and target are the same database');
if (target.hostname.includes('-pooler'))
	fail(`target ${target.hostname} is a pooled host; put DATABASE_URL_UNPOOLED in ${toFile}`);

const bin = (tool: string) => {
	const dirs = [process.env.PG_BIN, '/opt/homebrew/opt/libpq/bin', '/usr/local/opt/libpq/bin'];
	for (const dir of dirs) if (dir && existsSync(join(dir, tool))) return join(dir, tool);
	return tool; // on PATH
};

console.log(`source: ${source.hostname}${source.pathname}`);
console.log(`target: ${target.hostname}${target.pathname}${apply ? '' : '  (dry run)'}`);

const src = postgres(source.href, { max: 1, onnotice: () => {} });
const dst = postgres(target.href, { max: 1, onnotice: () => {} });
let failed = false;
const work = mkdtempSync(join(tmpdir(), 'explorin-copy-'));

try {
	const sourceCounts = await counts(src);
	const before = await counts(dst);
	console.log(`source tables: ${describe(sourceCounts)}`);
	console.log(`target tables: ${before.size ? describe(before) : '(none)'}`);
	if (before.size && !replace)
		throw new Error(
			'the target already has app tables; pass --replace to drop them as part of the copy'
		);

	const [{ v }] = await src<{ v: string }[]>`SELECT current_setting('server_version_num') AS v`;
	const major = v.slice(0, -4);
	const tool = execFileSync(bin('pg_dump'), ['--version'], { encoding: 'utf8' }).match(
		/(\d+)\./
	)?.[1];
	if (Number(tool) < Number(major))
		throw new Error(`pg_dump ${tool} is older than the source (Postgres ${major})`);

	if (!apply) {
		console.log('nothing changed; pass --apply to copy');
	} else {
		const dump = join(work, 'public.dump');
		run('pg_dump', source, [
			'--format=custom',
			'--schema=public',
			'--extension=vector',
			'--no-owner',
			'--no-privileges',
			`--file=${dump}`
		]);

		// The target already has a `public` schema and may already have `vector`; their CREATE and COMMENT entries
		// would fail for a non-superuser, so the restore list leaves them out and the prelude creates the extension.
		const toc = run('pg_restore', null, ['--list', dump]);
		const kept = toc
			.split('\n')
			.filter((line) => !/ (SCHEMA|EXTENSION) - | COMMENT - (SCHEMA|EXTENSION) /.test(line))
			.join('\n');
		writeFileSync(join(work, 'restore.list'), kept);

		const prelude = [
			'CREATE EXTENSION IF NOT EXISTS vector;',
			...[...before.keys()].map((t) => `DROP TABLE IF EXISTS public.${quote(t)} CASCADE;`)
		];
		// pg_restore --single-transaction can't run SQL first, so the drop and the restore share one psql session.
		const sqlFile = join(work, 'restore.sql');
		writeFileSync(
			sqlFile,
			run('pg_restore', null, [
				`--use-list=${join(work, 'restore.list')}`,
				'--no-owner',
				'--no-privileges',
				'--file=-',
				dump
			])
		);
		writeFileSync(join(work, 'prelude.sql'), prelude.join('\n') + '\n');
		run('psql', target, [
			'--no-psqlrc',
			'--quiet',
			'--set=ON_ERROR_STOP=1',
			'--single-transaction',
			`--file=${join(work, 'prelude.sql')}`,
			`--file=${sqlFile}`
		]);
		await dst`ANALYZE`;

		const after = await counts(dst);
		const mismatched = [...sourceCounts].filter(([t, n]) => after.get(t) !== n);
		console.log(`copied: ${describe(after)}`);
		if (mismatched.length)
			throw new Error(
				`row counts differ for ${mismatched.map(([t, n]) => `${t} (${n} → ${after.get(t) ?? 'missing'})`).join(', ')}`
			);
		console.log(`done: ${sourceCounts.size} tables, row counts match`);
	}
} catch (e) {
	failed = true;
	console.error(`copy-db: ${(e as Error).message}`);
} finally {
	rmSync(work, { recursive: true, force: true });
	await Promise.all([src.end(), dst.end()]);
}
if (failed) process.exit(1);

/** Row count of every base table in `public`, by name. */
async function counts(db: postgres.Sql): Promise<Map<string, number>> {
	const tables = await db<{ name: string }[]>`
		SELECT table_name AS name FROM information_schema.tables
		WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY 1`;
	const out = new Map<string, number>();
	for (const { name } of tables) {
		const [{ n }] = await db.unsafe<{ n: number }[]>(
			`SELECT count(*)::int AS n FROM public.${quote(name)}`
		);
		out.set(name, n);
	}
	return out;
}

function describe(tables: Map<string, number>) {
	return [...tables].map(([t, n]) => `${t} ${n}`).join(', ');
}

function quote(identifier: string) {
	return `"${identifier.replaceAll('"', '""')}"`;
}

/** Run a libpq tool against `db` (password through PGPASSWORD), or with no connection; returns stdout. */
function run(tool: string, db: URL | null, toolArgs: string[]): string {
	const env = { ...process.env };
	const connection: string[] = [];
	if (db) {
		const bare = new URL(db.href);
		env.PGPASSWORD = decodeURIComponent(bare.password);
		bare.password = '';
		connection.push(`--dbname=${bare.href}`);
	}
	const res = spawnSync(bin(tool), [...connection, ...toolArgs], {
		env,
		encoding: 'utf8',
		maxBuffer: 1 << 30
	});
	if (res.error)
		throw new Error(`${tool}: ${res.error.message} (install with: brew install libpq)`);
	if (res.status !== 0)
		throw new Error(`${tool} exited ${res.status}: ${res.stderr.trim().slice(0, 2000)}`);
	return res.stdout;
}

function readUrl(file: string, label: string): URL {
	if (!existsSync(file)) fail(`${label} env file ${file} not found`);
	const vars = parseEnv(readFileSync(file, 'utf8'));
	const raw = vars.DATABASE_URL_UNPOOLED || vars.DATABASE_URL;
	if (!raw) fail(`${file} has no DATABASE_URL_UNPOOLED or DATABASE_URL`);
	try {
		return new URL(raw);
	} catch {
		fail(
			`${label} URL in ${file} is not valid (percent-encode special characters in the password)`
		);
	}
}

function fail(message: string): never {
	console.error(`copy-db: ${message}`);
	process.exit(1);
}
