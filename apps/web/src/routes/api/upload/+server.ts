import { json, error, type RequestHandler } from '@sveltejs/kit';
import { putPhoto } from '#storage';

const MAX_BYTES = 8 * 1024 * 1024;

/** POST multipart/form-data with one or more "files" -> { urls: string[] }. EXIF (incl. GPS) is stripped client side via canvas re-encode. */
export const POST: RequestHandler = async ({ request, locals }) => {
	const form = await request.formData();
	const files = form.getAll('files').filter((f): f is File => f instanceof File);
	if (!files.length) error(400, 'No files');
	if (files.length > 5) error(400, 'Max 5 photos');

	const urls: string[] = [];
	for (const f of files) {
		if (!f.type.startsWith('image/')) error(400, 'Images only');
		if (f.size > MAX_BYTES) error(400, 'Each photo must be under 8 MB');
		urls.push(await putPhoto(locals.uid, f));
	}
	return json({ urls });
};
