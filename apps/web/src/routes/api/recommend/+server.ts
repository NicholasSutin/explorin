import { json, error, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { recommendCached } from '#lib/server/recommend';

const Body = z.object({
	prompt: z.string().trim().min(3).max(300),
	lat: z.number().optional(),
	lng: z.number().optional()
});

export const POST: RequestHandler = async ({ request, locals }) => {
	const parsed = Body.safeParse(await request.json());
	if (!parsed.success) error(400, parsed.error.issues[0]?.message ?? 'Bad request');
	const { prompt, lat, lng } = parsed.data;
	try {
		return json(await recommendCached(locals.uid, prompt, lat, lng));
	} catch (e: any) {
		if (e?.status) error(e.status, e.message);
		console.error('recommend failed', e);
		error(500, 'Could not build recommendations');
	}
};
