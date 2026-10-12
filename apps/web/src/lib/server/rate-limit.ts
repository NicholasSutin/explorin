/**
 * Rate limits for the account endpoints, on Cloudflare's rate-limit bindings (wrangler.jsonc `ratelimits`).
 * One rule per POST path under /api/auth that spends something: an email, a password guess, an account.
 * Every hit is counted on two keys and both must pass: the client (an IPv6 /64, or the IPv4 address) so one
 * host cannot spray many addresses, and the target email so a proxy pool cannot hammer one account.
 *
 * Outside Workers (adapter-node, `vite dev`) there are no bindings and the gate is skipped. On Workers a
 * missing binding is a deployment mistake, so the gate fails closed with a 503 instead of running unlimited
 * (except under `wrangler dev`, where `dev` is false too, so keep the bindings in wrangler.jsonc).
 * https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
 */
import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { dev } from '$app/env';
// adapter-cloudflare 8 does not populate `event.platform`; bindings come from `cloudflare:workers`,
// behind a Vite alias so the adapter-node build never imports that module (see vite.config.ts).
import { bindings, onWorkers } from '#bindings';

type Limiter = { limit(options: { key: string }): Promise<{ success: boolean }> };

const RULES: Record<string, { binding: string; kind: string; message: string }> = {
	'/sign-in/email': {
		binding: 'RATE_LIMITER_SIGN_IN',
		kind: 'sign-in',
		message: 'Too many sign-in attempts. Please wait a minute and try again.'
	},
	// Sign-up: the emailed link that creates the account (or signs an existing one in).
	'/sign-in/magic-link': {
		binding: 'RATE_LIMITER_SIGN_UP',
		kind: 'sign-up',
		message: 'Too many sign-up attempts. Please wait a minute and try again.'
	},
	'/send-verification-email': {
		binding: 'RATE_LIMITER_EMAIL_SEND',
		kind: 'email-send',
		message: 'Too many emails requested. Please wait a minute before asking for another.'
	},
	'/request-password-reset': {
		binding: 'RATE_LIMITER_EMAIL_SEND',
		kind: 'email-send',
		message: 'Too many emails requested. Please wait a minute before asking for another.'
	},
	'/reset-password': {
		binding: 'RATE_LIMITER_TOKEN_VERIFY',
		kind: 'token-verify',
		message: 'Too many attempts. Please wait a minute and try again.'
	}
};

const AUTH_BASE = '/api/auth';

/** Client address as Cloudflare saw it; the first 64 bits for IPv6, where one host owns a whole /64. */
export function clientKey(request: Request): string {
	const ip = request.headers.get('cf-connecting-ip')?.trim();
	if (!ip) return 'unknown';
	if (!ip.includes(':')) return ip;
	const addr = ip
		.replace(/^\[|\]$/g, '')
		.split('%')[0]
		.toLowerCase();
	// Expand "::" so the first four hextets are the first four hextets.
	const [head, tail = ''] = addr.split('::');
	const h = head ? head.split(':') : [];
	const t = tail ? tail.split(':') : [];
	const full = [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t];
	return full.slice(0, 4).join(':') + '::/64';
}

const normalizeEmail = (v: unknown) =>
	typeof v === 'string' ? v.trim().toLowerCase().slice(0, 254) : '';

/**
 * Answer with 429 when this request is over budget, 503 when the binding is missing on Workers,
 * or null to let it through. Only POSTs to a listed path are counted.
 */
export async function authRateLimit(event: RequestEvent): Promise<Response | null> {
	const { request, url } = event;
	if (request.method !== 'POST' || !url.pathname.startsWith(AUTH_BASE)) return null;
	const rule = RULES[url.pathname.slice(AUTH_BASE.length)];
	if (!rule) return null;

	if (!onWorkers) return null; // adapter-node / vite dev: no Cloudflare bindings exist here
	const limiter = bindings[rule.binding] as Limiter | undefined;
	if (!limiter) {
		if (dev) return null;
		console.error(`[rate-limit] binding ${rule.binding} missing; refusing ${url.pathname}`);
		return json({ message: 'Accounts are temporarily unavailable.' }, { status: 503 });
	}

	// better-auth only accepts JSON bodies, so a body we cannot parse is one it rejects too.
	let email = '';
	try {
		email = normalizeEmail(((await request.clone().json()) as { email?: unknown }).email);
	} catch {
		/* not JSON */
	}
	const checks = [limiter.limit({ key: `${rule.kind}:ip:${clientKey(request)}` })];
	if (email) checks.push(limiter.limit({ key: `${rule.kind}:email:${email}` }));
	const results = await Promise.all(checks);
	if (results.some((r) => !r.success)) {
		console.warn(`[rate-limit] ${rule.kind} over budget`, {
			ip: clientKey(request),
			email: !!email
		});
		return json({ message: rule.message }, { status: 429, headers: { 'Retry-After': '60' } });
	}
	return null;
}
