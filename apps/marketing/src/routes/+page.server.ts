import { fail } from '@sveltejs/kit';
import { APP_URL } from '$app/env/private';
import { sendWelcome } from '#lib/server/email';
import { turnstileConfigured, verifyTurnstile } from '#lib/server/turnstile';
import { email, join, waitlistEnabled } from '#lib/server/waitlist';
import type { Actions, PageServerLoad } from './$types';

/** Must match the `action` the widget is rendered with, so a token minted elsewhere cannot be replayed here. */
export const ACTION = 'waitlist';

export const load: PageServerLoad = () => ({ appUrl: APP_URL });

export const actions: Actions = {
	join: async ({ request, getClientAddress }) => {
		const form = await request.formData();
		// Honeypot: real people never fill a field they cannot see.
		if (form.get('website')) return { status: 'added' as const };
		const parsed = email.safeParse(form.get('email'));
		if (!parsed.success)
			return fail(400, { error: parsed.error.issues[0]?.message ?? 'Please enter your email.' });
		if (!turnstileConfigured() || !waitlistEnabled())
			return fail(503, { error: 'The waitlist is not available right now.' });
		// Gate: nothing below runs until Cloudflare confirms the token.
		if (!(await verifyTurnstile(form.get('cf-turnstile-response'), ACTION, getClientAddress())))
			return fail(403, { error: 'Please complete the security check and try again.' });
		try {
			const source = (form.get('source') as string | null)?.slice(0, 80) ?? null;
			const status = await join(parsed.data, source);
			if (status === 'added') await sendWelcome(parsed.data);
			return { status };
		} catch (e) {
			console.error('[waitlist] insert failed', e);
			return fail(500, { error: 'Something went wrong. Please try again.' });
		}
	}
};
