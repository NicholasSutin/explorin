import { error, type RequestHandler } from '@sveltejs/kit';
import { getPhoto } from '#storage';

/** A person's own uploads only: keys are `<user id>/<uuid>.<ext>`, so the prefix is the ownership check. */
export const GET: RequestHandler = async ({ params, locals }) => {
	const key = params.key ?? '';
	if (!locals.uid || !key.startsWith(`${locals.uid}/`)) error(404, 'Not found');
	const photo = await getPhoto(key);
	if (!photo) error(404, 'Not found');
	return new Response(photo.body, {
		headers: {
			'Content-Type': photo.contentType,
			'Cache-Control': 'private, max-age=31536000, immutable',
			// Uploaded bytes are never scripts on this origin, whatever their declared type.
			'X-Content-Type-Options': 'nosniff',
			'Content-Security-Policy': 'sandbox',
			'Content-Disposition': 'inline'
		}
	});
};
