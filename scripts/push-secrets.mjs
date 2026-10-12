#!/usr/bin/env node
/**
 * Manage a Worker's secrets from a local `.env.prod` (never committed).
 *
 *   npm run secrets:web            status   what is on the Worker vs. in the file; writes nothing
 *   npm run secrets:web:new        new      create the keys the Worker does not have yet; never overwrites
 *   npm run secrets:web:update     update   create or overwrite every non-empty key in the file
 *   npm run secrets:web:sync       sync     update, then delete every secret the file does not set (confirms first)
 *   (same with secrets:marketing)
 *
 *   node scripts/push-secrets.mjs <web|marketing> [status|new|update|sync] [path/to/.env.prod]
 *
 * Keys that are plain `vars` in the app's wrangler.jsonc are ignored (a secret and a var cannot share a
 * name; change those in wrangler.jsonc). Empty values are ignored, except that `sync` deletes them.
 * `sync` refuses to run when the file sets nothing, so an unfilled .env.prod cannot wipe a Worker, and
 * asks you to type the Worker name before deleting. Values are never printed. Needs `npx wrangler login`.
 */
import { readFileSync, existsSync, copyFileSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MODES = ['status', 'new', 'update', 'sync'];

const [app, modeArg, fileArg] = process.argv.slice(2);
const mode = modeArg && MODES.includes(modeArg) ? modeArg : 'status';
const fileFromArgs = modeArg && !MODES.includes(modeArg) ? modeArg : fileArg;

const usage = () => {
	console.error('usage: node scripts/push-secrets.mjs <web|marketing> [status|new|update|sync] [.env.prod]');
	process.exit(2);
};
if (!app || !existsSync(join(ROOT, 'apps', app))) usage();
if (modeArg && !MODES.includes(modeArg) && fileArg) usage();

const appDir = join(ROOT, 'apps', app);
const envFile = fileFromArgs ? resolve(fileFromArgs) : join(appDir, '.env.prod');
const shown = relative(ROOT, envFile);

if (!existsSync(envFile)) {
	const example = join(appDir, '.env.prod.example');
	if (!fileFromArgs && existsSync(example)) {
		copyFileSync(example, envFile);
		console.error(`created ${shown} from .env.prod.example. Fill it in, then run this again.`);
	} else console.error(`${shown} not found.`);
	process.exit(2);
}

// JSONC -> JSON: drop line and block comments outside strings. wrangler.jsonc has no trailing commas.
function stripJsonc(src) {
	let out = '';
	for (let i = 0; i < src.length; i++) {
		const c = src[i];
		if (c === '"') {
			let j = i + 1;
			while (j < src.length && src[j] !== '"') j += src[j] === '\\' ? 2 : 1;
			out += src.slice(i, j + 1);
			i = j;
		} else if (c === '/' && src[i + 1] === '/') {
			while (i < src.length && src[i] !== '\n') i++;
			out += '\n';
		} else if (c === '/' && src[i + 1] === '*') {
			i = src.indexOf('*/', i + 2) + 1;
		} else out += c;
	}
	return out;
}
const wrangler = JSON.parse(stripJsonc(readFileSync(join(appDir, 'wrangler.jsonc'), 'utf8')));
const worker = wrangler.name;
const vars = new Set(Object.keys(wrangler.vars ?? {}));

// KEY=VALUE lines; `export` prefix, blank lines, comments and surrounding quotes are handled.
function parseEnv(text) {
	const out = {};
	for (const raw of text.split(/\r?\n/)) {
		const line = raw.trim();
		if (!line || line.startsWith('#')) continue;
		const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
		if (!m) continue;
		let v = m[2];
		if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
			v = v.slice(1, -1);
		else v = v.replace(/\s+#.*$/, '').trim();
		out[m[1]] = v;
	}
	return out;
}

const wranglerEnv = {
	...process.env,
	CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID ?? wrangler.account_id
};
const wranglerCmd = (args, opts = {}) =>
	spawnSync('npx', ['wrangler', ...args], { cwd: appDir, env: wranglerEnv, ...opts });

/** Names currently on the Worker. */
function listRemote() {
	const r = wranglerCmd(['secret', 'list', '--format', 'json'], { encoding: 'utf8' });
	if (r.status !== 0) {
		console.error(r.stderr || `could not list the secrets of ${worker}`);
		process.exit(r.status ?? 1);
	}
	return new Set(JSON.parse(r.stdout.slice(r.stdout.indexOf('['))).map((s) => s.name));
}

// --- plan ---------------------------------------------------------------------------------------------
const file = parseEnv(readFileSync(envFile, 'utf8'));
const set = {}; // non-empty, non-var keys from the file
const empty = [];
const asVar = [];
for (const [k, v] of Object.entries(file)) {
	if (vars.has(k)) asVar.push(k);
	else if (!v) empty.push(k);
	else set[k] = v;
}
const remote = listRemote();

const create = Object.keys(set).filter((k) => !remote.has(k));
const overwrite = Object.keys(set).filter((k) => remote.has(k));
const orphan = [...remote].filter((k) => !(k in set)).sort();

const list = (names) => (names.length ? names.join(', ') : 'none');
const pad = (s) => s.padEnd(12);

if (mode === 'status') {
	console.log(`${worker} <- ${shown}\n`);
	console.log(`${pad('new')} ${list(create)}`);
	console.log(`${pad('existing')} ${list(overwrite)}`);
	console.log(`${pad('orphaned')} ${list(orphan)}`);
	if (empty.length) console.log(`${pad('empty')} ${list(empty)}`);
	if (asVar.length) console.log(`${pad('vars')} ${list(asVar)}`);
	console.log(
		`\nnew: in the file, not on the Worker ("new" or "update" creates). existing: on both ("update" overwrites).\n` +
			`orphaned: on the Worker, not in the file (only "sync" deletes). empty / vars: ignored.`
	);
	process.exit(0);
}

const payload = {};
let deletions = [];
if (mode === 'new') {
	for (const k of create) payload[k] = set[k];
	if (overwrite.length) console.log(`already on ${worker}, left as is: ${list(overwrite)}`);
} else {
	for (const k of Object.keys(set)) payload[k] = set[k];
	if (mode === 'sync') {
		if (!Object.keys(set).length) {
			console.error(`refusing sync: ${shown} sets no secrets, so every secret on ${worker} would be deleted.`);
			process.exit(1);
		}
		deletions = orphan;
		for (const k of deletions) payload[k] = null;
	}
}

const creating = Object.keys(payload).filter((k) => payload[k] !== null && !remote.has(k));
const updating = Object.keys(payload).filter((k) => payload[k] !== null && remote.has(k));
if (!Object.keys(payload).length) {
	console.log(`nothing to do on ${worker}`);
	process.exit(0);
}
if (creating.length) console.log(`create on ${worker}: ${list(creating)}`);
if (updating.length) console.log(`update on ${worker}: ${list(updating)}`);
if (deletions.length) {
	console.log(`delete from ${worker}: ${list(deletions)}`);
	if (!process.stdin.isTTY) {
		console.error('deletions need a terminal to confirm; nothing sent');
		process.exit(1);
	}
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	const answer = await rl.question(`Type the Worker name (${worker}) to confirm the deletions: `);
	rl.close();
	if (answer.trim() !== worker) {
		console.error('aborted, nothing sent');
		process.exit(1);
	}
}

const r = wranglerCmd(['secret', 'bulk'], {
	input: JSON.stringify(payload),
	stdio: ['pipe', 'inherit', 'inherit']
});
process.exit(r.status ?? 1);
