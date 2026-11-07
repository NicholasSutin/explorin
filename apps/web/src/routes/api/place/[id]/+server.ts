import { error, json } from '@sveltejs/kit';
import { placeCard, placesEnabled, validPlaceId } from '#lib/server/places';
import type { RequestHandler } from './$types';

/** GET /api/place/<google place id>: name, kind, address, photo and position of a landmark tapped on the map. */
export const GET: RequestHandler = async ({ params, setHeaders }) => {
	if (!validPlaceId(params.id)) error(400, 'Invalid place.');
	if (!placesEnabled()) error(503, 'Place details are not configured.');
	const card = await placeCard(params.id);
	if (!card) error(404, 'Place unavailable.');
	setHeaders({ 'Cache-Control': 'private, max-age=3600' });
	return json(card);
};
