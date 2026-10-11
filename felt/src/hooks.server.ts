import type { Handle } from '@sveltejs/kit/hooks';

export const handle: Handle = async ({ event, resolve }) => {
	let uid = event.cookies.get('uid');
	if (!uid) {
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
