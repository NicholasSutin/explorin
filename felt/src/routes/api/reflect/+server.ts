import { json, error, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { analyzeReflection } from '#lib/server/reflect';

const Body = z.object({
	experienceId: z.string().uuid(),
	text: z.string().trim().min(3).max(1000),
	photoUrls: z.array(z.string()).max(3).default([]),
	consent: z.boolean().default(true)
});

export const POST: RequestHandler = async ({ request, locals }) => {
	const parsed = Body.safeParse(await request.json());
	if (!parsed.success) error(400, parsed.error.issues[0]?.message ?? 'Bad request');
	const { experienceId, text, photoUrls, consent } = parsed.data;
	try {
		return json(await analyzeReflection(locals.uid, experienceId, text, photoUrls, consent));
	} catch (e: any) {
		if (e?.status) error(e.status, e.message);
		console.error('reflect failed', e);
		error(500, 'Could not analyze reflection');
	}
};
