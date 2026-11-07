import { json } from '@sveltejs/kit';
import { deleteTrip } from '#lib/server/trips';
import type { RequestHandler } from './$types';

/** DELETE /api/trip/<id>: remove a trip (and its stops). Photos stay until account deletion. */
export const DELETE: RequestHandler = async ({ params, locals }) => {
	await deleteTrip(locals.uid, params.id);
	return json({ ok: true });
};
