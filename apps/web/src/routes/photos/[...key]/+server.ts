import { error, type RequestHandler } from '@sveltejs/kit';
import { getPhoto } from '#storage';

/**
 * A person's own uploads only: keys are `<user id>/<uuid>.<ext>`, so the prefix is the ownership check. The exact
 * shape is enforced too, so no `..` segment can walk out of the prefix on the local-disk store.
 */
const KEY = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/;
export const GET: RequestHandler = async ({ params, locals }) => {
	const key = params.key ?? '';
	if (!locals.uid || !KEY.test(key) || !key.startsWith(`${locals.uid}/`)) error(404, 'Not found');
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
