import { fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { hasPassword, setPassword } from '#lib/server/auth';
import type { Actions, PageServerLoad } from './$types';

/**
 * Where the emailed sign-up link lands: the session already exists (the link created the account and
 * signed it in), so this page only asks for the password. Accounts that already have one skip ahead.
 */
export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(303, '/signup');
	if (await hasPassword(locals.user.id)) redirect(303, '/onboarding');
	return { email: locals.user.email };
};

const Form = z
	.object({
		password: z
			.string()
			.min(8, 'Use at least 8 characters.')
			.max(128, 'Use at most 128 characters.'),
		confirm: z.string()
	})
	.refine((f) => f.password === f.confirm, {
		message: 'The two passwords differ.',
		path: ['confirm']
	});

export const actions: Actions = {
	default: async ({ request, locals }) => {
		if (!locals.user) redirect(303, '/signup');
		const form = await request.formData();
		const parsed = Form.safeParse({ password: form.get('password'), confirm: form.get('confirm') });
		if (!parsed.success)
			return fail(400, { message: parsed.error.issues[0]?.message ?? 'Please check the form.' });
		try {
			await setPassword(request.headers, parsed.data.password);
		} catch (e) {
			const code = (e as { body?: { code?: string } }).body?.code;
			if (code === 'PASSWORD_ALREADY_SET') redirect(303, '/onboarding');
			console.warn('[auth] set-password failed', (e as Error).message);
			return fail(500, { message: 'Could not save your password. Please try again.' });
		}
		// /onboarding forwards accounts that have already finished it.
		redirect(303, '/onboarding');
	}
};
