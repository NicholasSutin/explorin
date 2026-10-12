import { fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { completeOnboarding } from '#lib/server/auth';
import type { Actions, PageServerLoad } from './$types';

/** The interest chips; the same vocabulary the discovery prompt uses. */
const TOPICS = [
	'Nature',
	'Art & culture',
	'Food',
	'Hidden gems',
	'Slow moments',
	'Something active'
] as const;

const Form = z.object({
	name: z.string().trim().min(1, 'Tell us your first name.').max(40),
	homeCity: z.string().trim().min(1, 'Which city are you exploring?').max(60),
	interests: z.array(z.enum(TOPICS)).max(TOPICS.length)
});

export const load: PageServerLoad = ({ locals }) => ({
	name: locals.user?.name ?? '',
	topics: TOPICS
});

export const actions: Actions = {
	default: async ({ request, locals }) => {
		if (!locals.user) redirect(303, '/login?next=/onboarding');
		const form = await request.formData();
		const parsed = Form.safeParse({
			name: form.get('name'),
			homeCity: form.get('homeCity'),
			interests: form.getAll('interests')
		});
		if (!parsed.success) {
			return fail(400, {
				message: parsed.error.issues[0]?.message ?? 'Please check the form.',
				name: String(form.get('name') ?? ''),
				homeCity: String(form.get('homeCity') ?? ''),
				interests: form.getAll('interests').map(String)
			});
		}
		await completeOnboarding(locals.user.id, parsed.data);
		redirect(303, '/onboarding/photos');
	}
};
