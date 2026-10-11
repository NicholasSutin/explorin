import { json, error, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { buildProfile } from '#lib/server/profile';
import { getProfile } from '#lib/server/db';

const Body = z.object({
	name: z.string().trim().min(1).max(40),
	photoUrls: z.array(z.string().min(1)).min(1).max(5),
	bio: z.string().trim().max(200).optional()
});

export const GET: RequestHandler = async ({ locals }) =>
	json({ profile: await getProfile(locals.uid) });

export const POST: RequestHandler = async ({ request, locals }) => {
	const parsed = Body.safeParse(await request.json());
	if (!parsed.success) error(400, parsed.error.issues[0]?.message ?? 'Bad request');
	const { name, photoUrls, bio } = parsed.data;
	const profile = await buildProfile(locals.uid, name, photoUrls, bio);
	return json({ profile });
};
