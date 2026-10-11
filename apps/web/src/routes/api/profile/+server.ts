import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { parseBody } from '#lib/server/http';
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
	const { name, photoUrls, bio } = await parseBody(request, Body);
	return json({ profile: await buildProfile(locals.uid, name, photoUrls, bio) });
};
