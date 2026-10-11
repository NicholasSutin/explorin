import { redirect, error } from '@sveltejs/kit';
import { photoUri, placesEnabled, validPhotoName } from '#lib/server/places';
import type { RequestHandler } from './$types';

/** GET /api/photo?name=places/ID/photos/REF -> 302 to the Google-hosted image. */
export const GET: RequestHandler = async ({ url, setHeaders }) => {
	const name = url.searchParams.get('name') || '';
	if (!validPhotoName(name)) error(400, 'Invalid photo name.');
	if (!placesEnabled()) error(503, 'Place photos are not configured.');
	const uri = await photoUri(name);
	if (!uri) error(404, 'Photo unavailable.');
	setHeaders({ 'Cache-Control': 'public, max-age=3600' });
	redirect(302, uri);
};
