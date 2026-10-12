import { fail } from '@sveltejs/kit';
import { publicAppUrl } from '#lib/server/app-url';
import { sendWelcome } from '#lib/server/email';
import { turnstileConfigured, verifyTurnstile } from '#lib/server/turnstile';
import { email, join, waitlistEnabled } from '#lib/server/waitlist';
import type { Actions, PageServerLoad } from './$types';

/**
 * Must match the `action` the widget is rendered with, so a token minted elsewhere cannot be replayed here.
 * Not exported: SvelteKit only allows its own named exports from a route module, and the build fails otherwise.
 */
const ACTION = 'waitlist';

/**
 * The header's "Open the app" link. Hidden until APP_URL is set, and also when APP_URL points back at
 * this site: explorin.app serves the landing page, so a link there would just reload the page.
 */
export const load: PageServerLoad = ({ url }) => ({ appUrl: publicAppUrl(url) });

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
