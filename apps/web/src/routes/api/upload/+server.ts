import { json, error, type RequestHandler } from '@sveltejs/kit';
import { putPhoto } from '#storage';

const MAX_BYTES = 8 * 1024 * 1024;
/** The browser re-encodes everything to JPEG; the others are accepted for direct API use. SVG is not an upload format. */
const TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/** POST multipart/form-data with one or more "files" -> { urls: string[] }. EXIF (incl. GPS) is stripped client side via canvas re-encode. */
export const POST: RequestHandler = async ({ request, locals }) => {
	const form = await request.formData();
	const files = form.getAll('files').filter((f): f is File => f instanceof File);
	if (!files.length) error(400, 'No files');
	if (files.length > 5) error(400, 'Max 5 photos');
	for (const f of files) {
		if (!TYPES.has(f.type)) error(400, 'JPEG, PNG or WebP only');
		if (f.size > MAX_BYTES) error(400, 'Each photo must be under 8 MB');
	}
	return json({ urls: await Promise.all(files.map((f) => putPhoto(locals.uid, f))) });
};
