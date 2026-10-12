/**
 * Server-side Turnstile check (siteverify). The browser never calls Cloudflare directly: the
 * widget's token travels with the form post and is redeemed here, exactly once. Fails closed on
 * every path: missing config, network error, non-2xx, wrong action, hostname not in the allowlist.
 * https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 */
import { dev } from '$app/env';
import { TURNSTILE_HOSTNAMES, TURNSTILE_SECRET_KEY } from '$app/env/private';

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

interface Outcome {
	success?: boolean;
	action?: string;
	hostname?: string;
	'error-codes'?: string[];
	metadata?: { result_with_testing_key?: boolean };
}

export const turnstileConfigured = () =>
	Boolean(TURNSTILE_SECRET_KEY) && TURNSTILE_HOSTNAMES.length > 0;

/** True only when Cloudflare confirms this token was solved for `action` on an allowed hostname. */
export async function verifyTurnstile(
	token: FormDataEntryValue | null,
	action: string,
	remoteip?: string
): Promise<boolean> {
	if (!turnstileConfigured()) return false;
	if (typeof token !== 'string' || !token || token.length > 2048) return false;
	const body = new URLSearchParams({ secret: TURNSTILE_SECRET_KEY!, response: token });
	if (remoteip) body.set('remoteip', remoteip);
	let outcome: Outcome;
	try {
		const res = await fetch(SITEVERIFY, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body,
			signal: AbortSignal.timeout(10_000)
		});
		if (!res.ok) {
			console.warn('[turnstile] siteverify responded', res.status);
			return false;
		}
		outcome = (await res.json()) as Outcome;
	} catch (e) {
		console.warn('[turnstile] siteverify unreachable', (e as Error).message);
		return false;
	}
	if (outcome.success !== true) {
		console.warn('[turnstile] rejected', outcome['error-codes']);
		return false;
	}
	// Cloudflare's testing secrets answer without an action and with hostname "example.com".
	// Accepted in `vite dev` only, so a test key can never pass in production.
	if (outcome.metadata?.result_with_testing_key) {
		if (!dev) console.warn('[turnstile] testing key used outside dev');
		return dev && TURNSTILE_HOSTNAMES.includes(outcome.hostname ?? '');
	}
	if (outcome.action !== action) {
		console.warn('[turnstile] rejected', outcome['error-codes'], outcome.action);
		return false;
	}
	if (!outcome.hostname || !TURNSTILE_HOSTNAMES.includes(outcome.hostname.toLowerCase())) {
		console.warn('[turnstile] hostname not allowed', outcome.hostname);
		return false;
	}
	return true;
}
