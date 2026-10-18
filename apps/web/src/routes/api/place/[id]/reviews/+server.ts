import { error, json } from '@sveltejs/kit';
import { placeReviews, placesEnabled, validPlaceId } from '#lib/server/places';
import type { RequestHandler } from './$types';

/** GET /api/place/<id>/reviews: Google rating and up to 5 reviews, only when someone opens them (priciest SKU). */
export const GET: RequestHandler = async ({ params, setHeaders }) => {
	if (!validPlaceId(params.id)) error(400, 'Invalid place.');
	if (!placesEnabled()) error(503, 'Reviews are not configured.');
	const reviews = await placeReviews(params.id);
	if (!reviews) error(502, 'Reviews unavailable right now.');
	setHeaders({ 'Cache-Control': 'private, max-age=3600' });
	return json(reviews);
};
