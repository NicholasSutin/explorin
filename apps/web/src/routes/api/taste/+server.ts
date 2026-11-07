import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { GRADES } from '#lib/taste';
import { parseBody } from '#lib/server/http';
import { getTaste, nextCategories, saveGrades } from '#lib/server/taste';
import { markOnboarded } from '#lib/server/auth';
import type { RequestHandler } from './$types';

const Body = z.object({
	grades: z.record(z.string().max(40), z.enum(GRADES).nullable()),
	offered: z.array(z.string().max(40)).max(40).default([]),
	/** True on the last save of onboarding: the account can start planning. */
	finish: z.boolean().default(false)
});

/** POST /api/taste: merge grades into the profile (null clears one). */
export const POST: RequestHandler = async ({ request, locals }) => {
	const { grades, offered, finish } = await parseBody(request, Body);
	await saveGrades(locals.uid, locals.user?.name ?? null, grades, offered);
	if (finish && !locals.user?.onboardedAt) await markOnboarded(locals.uid);
	return json({ ok: true });
};

/** GET /api/taste?count=6: the next cards worth grading, skipping everything already shown. */
export const GET: RequestHandler = async ({ url, locals }) => {
	const count = Math.min(12, Math.max(1, Number(url.searchParams.get('count')) || 6));
	const taste = await getTaste(locals.uid);
	const ids = await nextCategories(
		{
			blurb: taste?.blurb ?? '',
			interests: taste?.interests ?? [],
			audience: taste?.audience ?? []
		},
		[...(taste?.offered ?? []), ...Object.keys(taste?.grades ?? {})],
		count
	);
	return json({ ids });
};
