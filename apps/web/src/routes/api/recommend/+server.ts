import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { parseBody } from '#lib/server/http';
import { recommendCached } from '#lib/server/recommend';

const Body = z.object({
	prompt: z.string().trim().min(3).max(300),
	lat: z.number().optional(),
	lng: z.number().optional()
});

export const POST: RequestHandler = async ({ request, locals }) => {
	const { prompt, lat, lng } = await parseBody(request, Body);
	return json(await recommendCached(locals.uid, prompt, lat, lng));
};
