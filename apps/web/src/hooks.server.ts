import { redirect, json } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import type { Handle, HandleServerError } from '@sveltejs/kit/hooks';
import { building } from '$app/env';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { auth, authConfigured, getSession } from '#lib/server/auth';
import { authRateLimit } from '#lib/server/rate-limit';
import { sqlFor } from '#lib/server/db';
import { flushUsage } from '#lib/server/usage';
import { onWorkers, waitUntil } from '#bindings';

/**
 * Explorin is sign-in first: every page and API needs an account except these. `/welcome` is the guest landing
 * page, the rest are the account flow itself. Static files (static/) are served before this hook runs.
 */
const PUBLIC = [
	'/welcome',
	'/login',
	'/signup',
	'/signup/password',
	'/forgot',
	'/reset-password',
	'/signout'
];
/** Signed-in visitors are sent home from these (exact paths: /signup/password needs the session the link just set). */
const GUEST_ONLY = ['/welcome', '/login', '/signup', '/forgot'];
/** better-auth's session cookie: `__Secure-` is prepended whenever `useSecureCookies` is on (production). */
const SESSION_COOKIES = ['__Secure-explorin.session_token', 'explorin.session_token'];

/** better-auth owns /api/auth/*; everything else falls through. Fails closed without a real secret. */
const authRoutes: Handle = async ({ event, resolve }) => {
	if (!authConfigured() && event.url.pathname.startsWith('/api/auth/'))
		return json({ message: 'Accounts are not set up on this deployment.' }, { status: 503 });
	const limited = await authRateLimit(event);
	if (limited) return limited;
	return svelteKitHandler({ event, resolve, auth, building });
};

const session: Handle = async ({ event, resolve }) => {
	// Only ask the database when a session cookie is present.
	const hasCookie = SESSION_COOKIES.some((name) => event.cookies.get(name) !== undefined);
	const s = hasCookie && authConfigured() ? await getSession(event.request.headers) : null;
	event.locals.user = s?.user ?? null;
	event.locals.session = s?.session ?? null;
	event.locals.uid = s?.user.id ?? '';
	return resolve(event);
};

const guard: Handle = async ({ event, resolve }) => {
	const { pathname, search } = event.url;
	const { user } = event.locals;
	if (pathname.startsWith('/api/auth/')) return resolve(event);
	const isApi = pathname.startsWith('/api/');

	if (!user) {
		if (PUBLIC.includes(pathname)) return resolve(event);
		if (isApi) return json({ message: 'Sign in to continue.' }, { status: 401 });
		if (pathname === '/') redirect(303, '/welcome');
		redirect(303, `/login?next=${encodeURIComponent(pathname + search)}`);
	}

	if (GUEST_ONLY.includes(pathname)) redirect(303, '/');
	if (!isApi && !PUBLIC.includes(pathname)) {
		const onboarding = pathname === '/onboarding' || pathname.startsWith('/onboarding/');
		// Not yet through the tier list: everything leads back to onboarding (which resumes at the right step).
		if (!user.onboardedAt && !onboarding) redirect(303, '/onboarding');
		if (user.onboardedAt && pathname === '/onboarding' && !event.url.searchParams.has('edit'))
			redirect(303, '/');
	}
	return resolve(event);
};

/**
 * After the response body is done (it may be a stream that keeps working, so "after resolve" is too early)
 * and every `background()` task has settled: write the request's usage events, then on Workers close its
 * database connection. The body is piped through a transform whose flush/cancel starts this; the work runs
 * under `waitUntil` so the runtime does not cancel it along with the request.
 */
const afterResponse: Handle = async ({ event, resolve }) => {
	event.locals.background = [];
	const response = await resolve(event);
	let started = false;
	const finish = () => {
		if (started) return;
		started = true;
		const pending = event.locals.background ?? [];
		event.locals.background = [];
		const done = Promise.allSettled(pending)
			.then(() =>
				event.locals.usage?.length ? flushUsage(event.locals, sqlFor(event.locals)) : undefined
			)
			.then(() => {
				if (!onWorkers) return;
				const s = event.locals.sql;
				event.locals.sql = undefined;
				return s?.end({ timeout: 5 }).catch(() => {});
			});
		try {
			waitUntil(done);
		} catch {
			/* no request context left (Node); the promise still runs */
		}
	};
	if (!response.body) {
		finish();
		return response;
	}
	const body = response.body.pipeThrough(new TransformStream({ flush: finish, cancel: finish }));
	return new Response(body, response);
};

export const handle = sequence(afterResponse, authRoutes, session, guard);

/** Unexpected errors (not thrown via `error()`): log the cause, answer with one readable message. */
export const handleError: HandleServerError = ({ kind, error, event }) => {
	if (kind !== 'unknown') return; // `error()` and validation failures already carry their message
	console.error(`[${event.request.method} ${event.url.pathname}]`, error);
	return { message: 'Something went wrong. Please try again.' };
};
