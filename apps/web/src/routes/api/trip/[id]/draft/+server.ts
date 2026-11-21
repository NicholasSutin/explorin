import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { parseBody } from '#lib/server/http';
import { getTrip } from '#lib/server/trips';
import { draftKeepsake } from '#lib/server/keepsake';
import type { RequestHandler } from './$types';

const Body = z.object({ note: z.string().trim().max(1200) });

/** POST /api/trip/<id>/draft {note}: a suggested title, emotions and six "best for" tags; the note's own line to share. */
export const POST: RequestHandler = async ({ request, params, locals }) => {
	const { note } = await parseBody(request, Body, 'Keep the note under 1200 characters.');
	const trip = await getTrip(locals.uid, params.id);
	return json(await draftKeepsake(locals.uid, trip, note));
};
