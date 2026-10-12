import type { LayoutServerLoad } from './$types';

/** The signed-in account for headers and guards; null for guests. Never the whole user row. */
export const load: LayoutServerLoad = ({ locals }) => ({
	user: locals.user
		? {
				name: locals.user.name,
				email: locals.user.email,
				onboarded: Boolean(locals.user.onboardedAt)
			}
		: null
});
