import { fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { AUDIENCES, INTERESTS } from '#lib/taste';
import { getTaste, saveAboutYou, setFlipAnimations } from '#lib/server/taste';
import { changePassword, deleteAccount, updateAccount, usageSummary } from '#lib/server/account';
import { hasPassword } from '#lib/server/auth';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user!;
	const [taste, usage, password] = await Promise.all([
		getTaste(user.id),
		usageSummary(user.id),
		hasPassword(user.id)
	]);
	return {
		account: {
			name: user.name ?? '',
			email: user.email,
			homeCity: (user.homeCity as string | null | undefined) ?? '',
			hasPassword: password
		},
		taste: {
			blurb: taste?.blurb ?? '',
			interests: taste?.interests ?? [],
			audience: taste?.audience ?? [],
			grades: taste?.grades ?? {},
			flip: taste?.flipAnimations ?? true
		},
		usage
	};
};

const Account = z.object({
	name: z.string().trim().min(1, 'Your name can’t be empty.').max(40),
	homeCity: z.string().trim().min(2, 'Which city do you explore?').max(60)
});
const About = z.object({
	blurb: z.string().trim().min(12, 'A sentence or two, please.').max(600),
	interests: z.array(z.enum(INTERESTS)).min(1, 'Pick at least one interest.'),
	audience: z.array(z.enum(AUDIENCES))
});
const Password = z
	.object({
		current: z.string().min(1, 'Enter your current password.'),
		next: z.string().min(8, 'Use at least 8 characters.').max(128),
		confirm: z.string()
	})
	.refine((f) => f.next === f.confirm, { message: 'The new passwords differ.', path: ['confirm'] });

export const actions: Actions = {
	account: async ({ request, locals }) => {
		const form = await request.formData();
		const parsed = Account.safeParse({ name: form.get('name'), homeCity: form.get('homeCity') });
		if (!parsed.success)
			return fail(400, { section: 'account', message: parsed.error.issues[0].message });
		await updateAccount(locals.uid, parsed.data);
		return { section: 'account', saved: true };
	},
	about: async ({ request, locals }) => {
		const form = await request.formData();
		const parsed = About.safeParse({
			blurb: form.get('blurb'),
			interests: form.getAll('interests'),
			audience: form.getAll('audience')
		});
		if (!parsed.success)
			return fail(400, { section: 'about', message: parsed.error.issues[0].message });
		await saveAboutYou(locals.uid, locals.user?.name ?? '', parsed.data);
		return { section: 'about', saved: true };
	},
	flip: async ({ request, locals }) => {
		const form = await request.formData();
		await setFlipAnimations(locals.uid, form.get('flip') === 'on');
		return { section: 'flip', saved: true };
	},
	password: async ({ request }) => {
		const form = await request.formData();
		const parsed = Password.safeParse({
			current: form.get('current'),
			next: form.get('next'),
			confirm: form.get('confirm')
		});
		if (!parsed.success)
			return fail(400, { section: 'password', message: parsed.error.issues[0].message });
		try {
			await changePassword(request.headers, parsed.data.current, parsed.data.next);
		} catch (e) {
			const code = (e as { body?: { code?: string } }).body?.code;
			return fail(400, {
				section: 'password',
				message:
					code === 'INVALID_PASSWORD'
						? 'That current password isn’t right.'
						: 'Could not change your password.'
			});
		}
		return { section: 'password', saved: true };
	},
	delete: async ({ request, locals, cookies }) => {
		const form = await request.formData();
		if (
			String(form.get('confirm') ?? '')
				.trim()
				.toUpperCase() !== 'DELETE'
		)
			return fail(400, { section: 'delete', message: 'Type DELETE to confirm.' });
		await deleteAccount(locals.uid);
		for (const name of ['__Secure-explorin.session_token', 'explorin.session_token'])
			cookies.delete(name, { path: '/' });
		redirect(303, '/welcome?deleted=1');
	}
};
