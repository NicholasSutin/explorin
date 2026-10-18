import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { photoUrl } from '#lib/server/http';
import { parseBody } from '#lib/server/http';
import { analyzeReflection } from '#lib/server/reflect';

const Body = z.object({
	experienceId: z.string().uuid(),
	text: z.string().trim().min(3).max(1000),
	photoUrls: z.array(photoUrl).max(3).default([]),
	consent: z.boolean().default(true)
});

export const POST: RequestHandler = async ({ request, locals }) => {
	const { experienceId, text, photoUrls, consent } = await parseBody(request, Body);
	return json(await analyzeReflection(locals.uid, experienceId, text, photoUrls, consent));
};
