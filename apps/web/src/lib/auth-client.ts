/** Browser-side better-auth client. Calls go to this origin's /api/auth. */
import { createAuthClient } from 'better-auth/svelte';
import { inferAdditionalFields } from 'better-auth/client/plugins';
import type { auth } from '#lib/server/auth';

export const authClient = createAuthClient({ plugins: [inferAdditionalFields<typeof auth>()] });

/** Headers that satisfy the server's Turnstile check on sign-up, sign-in and password reset. */
export const captchaHeaders = (token: string) => ({ 'x-captcha-response': token });

/** Only same-origin paths may be used as a post-login destination. */
export function safeNext(value: string | null | undefined, fallback = '/'): string {
	if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\'))
		return fallback;
	return value;
}
