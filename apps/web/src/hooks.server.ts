import { redirect, json } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import type { Handle, HandleServerError } from '@sveltejs/kit/hooks';
import { building } from '$app/env';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { auth, authConfigured, getSession } from '#lib/server/auth';
import { authRateLimit } from '#lib/server/rate-limit';
import { onWorkers, waitUntil } from '#bindings';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Pages that need an account. `/onboarding` additionally needs it to be *not yet* onboarded. */
const PROTECTED_PAGES = ['/onboarding', '/ask', '/profile', '/go/', '/reflect/'];
/** API routes that write or read per-account data. Discovery, demo and map/photo proxies stay open. */
const PROTECTED_API = [
	'/api/profile',
	'/api/upload',
	'/api/experience',
	'/api/reflect',
	'/api/recommend',
	'/api/demo/persona'
];
/** Signed-in visitors are sent away from these. */
const GUEST_ONLY = ['/login', '/signup', '/forgot'];

const startsWithAny = (path: string, prefixes: string[]) =>
	prefixes.some((p) =>
		p.endsWith('/') ? path.startsWith(p) : path === p || path.startsWith(p + '/')
	);

/** better-auth owns /api/auth/*; everything else falls through. Fails closed without a real secret. */
const authRoutes: Handle = async ({ event, resolve }) => {
	if (!authConfigured() && event.url.pathname.startsWith('/api/auth/'))
		return json({ message: 'Accounts are not set up on this deployment.' }, { status: 503 });
	const limited = await authRateLimit(event);
	if (limited) return limited;
	return svelteKitHandler({ event, resolve, auth, building });
};

const session: Handle = async ({ event, resolve }) => {
	// Only ask the database when a session cookie is present; the demo path never touches it.
	const hasCookie = event.cookies.get('explorin.session_token') !== undefined;
	const s = hasCookie && authConfigured() ? await getSession(event.request.headers) : null;
	event.locals.user = s?.user ?? null;
	event.locals.session = s?.session ?? null;

	if (s) {
		event.locals.uid = s.user.id;
	} else {
		let uid = event.cookies.get('uid');
		// The uid is a storage path segment and a uuid column, so anything malformed is replaced.
		if (!uid || !UUID.test(uid)) {
			uid = crypto.randomUUID();
			event.cookies.set('uid', uid, {
				path: '/',
				maxAge: 60 * 60 * 24 * 30,
				httpOnly: true,
				sameSite: 'lax'
			});
		}
		event.locals.uid = uid;
	}
	return resolve(event);
};

const guard: Handle = async ({ event, resolve }) => {
	const { pathname, search } = event.url;
	const { user } = event.locals;
	const isPage = !pathname.startsWith('/api/');

	if (isPage && startsWithAny(pathname, PROTECTED_PAGES)) {
		if (!user) redirect(303, `/login?next=${encodeURIComponent(pathname + search)}`);
		const onboarding = pathname === '/onboarding' || pathname.startsWith('/onboarding/');
		if (!user.onboardedAt && !onboarding) redirect(303, '/onboarding');
		if (user.onboardedAt && pathname === '/onboarding') redirect(303, '/');
	}
	if (isPage && user && startsWithAny(pathname, GUEST_ONLY)) redirect(303, '/');
	if (
		!isPage &&
		!user &&
		startsWithAny(pathname, PROTECTED_API) &&
		event.request.method !== 'GET'
	) {
		return json({ message: 'Sign in to continue.' }, { status: 401 });
	}
	return resolve(event);
};

/**
 * Workers: close this request's database connection once the response body is done (it may be a stream
 * that keeps querying, so "after resolve" is too early) and every `background()` task has settled. The body
 * is piped through a transform whose flush/cancel starts the close; the close itself runs under
 * `waitUntil` so the runtime does not cancel it along with the request.
 */
const dbScope: Handle = async ({ event, resolve }) => {
	if (onWorkers) event.locals.background = [];
	const response = await resolve(event);
	if (!onWorkers) return response;
	const close = () => {
		const pending = event.locals.background ?? [];
		event.locals.background = [];
		const done = Promise.allSettled(pending).then(() => {
			const s = event.locals.sql;
			event.locals.sql = undefined;
			return s?.end({ timeout: 5 }).catch(() => {});
		});
		try {
			waitUntil(done);
		} catch {
			/* no request context left (should not happen); the promise still runs */
		}
	};
	if (!response.body) {
		close();
		return response;
	}
	const body = response.body.pipeThrough(new TransformStream({ flush: close, cancel: close }));
	return new Response(body, response);
};

export const handle = sequence(dbScope, authRoutes, session, guard);

/** Unexpected errors (not thrown via `error()`): log the cause, answer with one readable message. */
export const handleError: HandleServerError = ({ kind, error, event }) => {
	if (kind !== 'unknown') return; // `error()` and validation failures already carry their message
	console.error(`[${event.request.method} ${event.url.pathname}]`, error);
	return { message: 'Something went wrong. Please try again.' };
};
