import { error, json } from '@sveltejs/kit';
import { parseBody } from '#lib/server/http';
import { getTrip } from '#lib/server/trips';
import { keepsakeInput, saveKeepsake } from '#lib/server/keepsake';
import { addLearned } from '#lib/server/taste';
import { background } from '#lib/server/background';
import type { RequestHandler } from './$types';

/**
 * POST /api/trip/<id>/finish: save the note, photos, highlight and chosen tags; the trip joins the scrapbook.
 * Learned phrases the person kept are merged into their taste after the response (one embedding call).
 */
export const POST: RequestHandler = async ({ request, params, locals }) => {
	const input = await parseBody(request, keepsakeInput, 'Please check your note, photos and tags.');
	const trip = await getTrip(locals.uid, params.id);
	try {
		await saveKeepsake(locals.uid, locals.user?.name ?? null, trip, input);
	} catch (e) {
		if ((e as Error).message === 'Photo not yours') error(400, 'One of those photos is not yours.');
		throw e;
	}
	if (input.learned.length)
		background(addLearned(locals.uid, locals.user?.name ?? null, input.learned));
	return json({ ok: true });
};
