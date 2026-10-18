import { fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { AUDIENCES, INTERESTS } from '#lib/taste';
import { saveAccountBasics } from '#lib/server/auth';
import { getTaste, saveAboutYou } from '#lib/server/taste';
import type { Actions, PageServerLoad } from './$types';

const Form = z.object({
	name: z.string().trim().min(1, 'Tell us your first name.').max(40),
	homeCity: z.string().trim().min(2, 'Which city do you explore?').max(60),
	blurb: z
		.string()
		.trim()
		.min(12, 'A sentence or two about what you like to explore, please.')
		.max(600, 'Keep it under 600 characters.'),
	interests: z.array(z.enum(INTERESTS)).min(1, 'Pick at least one interest.').max(INTERESTS.length),
	audience: z.array(z.enum(AUDIENCES)).max(AUDIENCES.length)
});

export const load: PageServerLoad = async ({ locals, url }) => {
	const user = locals.user!;
	const taste = await getTaste(user.id);
	const homeCity = (user.homeCity as string | null | undefined) ?? '';
	// Step 1 already done and they did not come back on purpose: resume at the tier list. A taste row without a
	// blurb is an account from the old onboarding (migration 0001): it still has About-you to fill in.
	if (taste?.blurb && homeCity && !url.searchParams.has('back')) redirect(303, '/onboarding/taste');
	return {
		name: user.name ?? '',
		homeCity: homeCity || 'New York City',
		blurb: taste?.blurb ?? '',
		interests: taste?.interests ?? [],
		audience: taste?.audience ?? []
	};
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const form = await request.formData();
		const raw = {
			name: String(form.get('name') ?? ''),
			homeCity: String(form.get('homeCity') ?? ''),
			blurb: String(form.get('blurb') ?? ''),
			interests: form.getAll('interests').map(String),
			audience: form.getAll('audience').map(String)
		};
		const parsed = Form.safeParse(raw);
		if (!parsed.success)
			return fail(400, {
				message: parsed.error.issues[0]?.message ?? 'Please check the form.',
				...raw
			});
		const { name, homeCity, ...about } = parsed.data;
		await saveAccountBasics(locals.uid, { name, homeCity });
		await saveAboutYou(locals.uid, name, about);
		redirect(303, '/onboarding/taste');
	}
};
