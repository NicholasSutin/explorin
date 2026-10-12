#!/usr/bin/env node
/**
 * Push a local `.env.prod` to a Worker's secrets in one request (`wrangler secret bulk`).
 *
 *   node scripts/push-secrets.mjs <web|marketing> [path/to/.env.prod] [--dry-run]
 *   npm run secrets:web            # apps/web/.env.prod -> explorin-app
 *   npm run secrets:marketing      # apps/marketing/.env.prod -> explorin-marketing
 *
 * Keys that are plain `vars` in the app's wrangler.jsonc are skipped (a secret and a var cannot share a
 * name; change those in wrangler.jsonc). Empty values are skipped. Secrets already on the Worker that are
 * not in the file are left untouched. Values are never printed. Needs `npx wrangler login` once.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const [app, fileArg] = args.filter((a) => !a.startsWith('--'));

if (!app || !existsSync(join(root, 'apps', app))) {
	console.error('usage: node scripts/push-secrets.mjs <web|marketing> [.env.prod] [--dry-run]');
	process.exit(2);
}
const appDir = join(root, 'apps', app);
const envFile = fileArg ? resolve(fileArg) : join(appDir, '.env.prod');
if (!existsSync(envFile)) {
	console.error(`${envFile} not found. Copy .env.prod.example to .env.prod and fill it in.`);
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
const vars = new Set(Object.keys(wrangler.vars ?? {}));

/** KEY=VALUE lines; `export` prefix, blank lines, comments and surrounding quotes are handled. */
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
const env = parseEnv(readFileSync(envFile, 'utf8'));

const secrets = {};
for (const [k, v] of Object.entries(env)) {
	if (vars.has(k)) console.warn(`skip ${k}: it is a var in apps/${app}/wrangler.jsonc`);
	else if (!v) console.warn(`skip ${k}: empty`);
	else secrets[k] = v;
}
const names = Object.keys(secrets);
if (!names.length) {
	console.error('nothing to push');
	process.exit(1);
}
console.log(`${dryRun ? 'would push' : 'pushing'} ${names.length} secret(s) to ${wrangler.name}: ${names.join(', ')}`);
if (dryRun) process.exit(0);

const r = spawnSync('npx', ['wrangler', 'secret', 'bulk'], {
	cwd: appDir,
	input: JSON.stringify(secrets),
	stdio: ['pipe', 'inherit', 'inherit'],
	env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID ?? wrangler.account_id }
});
process.exit(r.status ?? 1);
