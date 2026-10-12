import { TURNSTILE_SITE_KEY } from '$app/env/public';
import { authConfigured } from '#lib/server/auth';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = () => ({
	/** When false the forms explain that accounts are not set up on this deployment. */
	authReady: authConfigured(),
	turnstileReady: Boolean(TURNSTILE_SITE_KEY)
});
