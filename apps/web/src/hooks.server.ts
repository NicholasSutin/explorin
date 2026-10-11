import type { Handle, HandleServerError } from '@sveltejs/kit/hooks';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const handle: Handle = async ({ event, resolve }) => {
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
	return resolve(event);
};

/** Unexpected errors (not thrown via `error()`): log the cause, answer with one readable message. */
export const handleError: HandleServerError = ({ kind, error, event }) => {
	if (kind !== 'unknown') return; // `error()` and validation failures already carry their message
	console.error(`[${event.request.method} ${event.url.pathname}]`, error);
	return { message: 'Something went wrong. Please try again.' };
};
