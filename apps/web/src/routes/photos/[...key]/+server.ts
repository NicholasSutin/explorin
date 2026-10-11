import { error, type RequestHandler } from '@sveltejs/kit';
import { getPhoto } from '#storage';

export const GET: RequestHandler = async ({ params }) => {
	const photo = await getPhoto(params.key!);
	if (!photo) error(404, 'Not found');
	return new Response(photo.body, {
		headers: {
			'Content-Type': photo.contentType,
			'Cache-Control': 'public, max-age=31536000, immutable'
		}
	});
};
