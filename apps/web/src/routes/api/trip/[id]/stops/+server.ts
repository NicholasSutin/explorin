import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { parseBody } from '#lib/server/http';
import { placeCard, validPlaceId } from '#lib/server/places';
import { addStop } from '#lib/server/trips';
import type { RequestHandler } from './$types';

const Body = z.object({ placeId: z.string().refine(validPlaceId, 'Invalid place') });

/** POST /api/trip/<id>/stops {placeId}: add a landmark tapped on the map to the day. */
export const POST: RequestHandler = async ({ request, params, locals }) => {
	const { placeId } = await parseBody(request, Body);
	const card = await placeCard(placeId);
	if (!card) error(404, 'That place could not be found.');
	return json({ stop: await addStop(locals.uid, params.id, card) });
};
