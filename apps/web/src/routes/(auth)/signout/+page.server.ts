import { redirect } from '@sveltejs/kit';
import { auth } from '#lib/server/auth';
import type { Actions, PageServerLoad } from './$types';

/** POST-only: a GET just goes home, so a crawled link can never end a session. */
export const load: PageServerLoad = () => {
	redirect(303, '/');
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		if (locals.session) {
			// The sveltekitCookies plugin copies the cleared cookie onto this response.
			await auth.api.signOut({ headers: request.headers }).catch((e: Error) => {
				console.warn('[auth] sign-out failed', e.message);
			});
		}
		redirect(303, '/');
	}
};
