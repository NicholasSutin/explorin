import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { parseBody } from '#lib/server/http';
import { updateStop } from '#lib/server/trips';
import type { RequestHandler } from './$types';

const Body = z.object({
	inPlan: z.boolean().optional(),
	visited: z.boolean().optional(),
	at: z
		.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) })
		.nullable()
		.optional()
});

/** PATCH /api/trip/<id>/stops/<stopId>: check in (optionally with your position), undo, or add/remove from the day. */
export const PATCH: RequestHandler = async ({ request, params, locals }) => {
	await updateStop(locals.uid, params.id, params.stopId, await parseBody(request, Body));
	return json({ ok: true });
};
