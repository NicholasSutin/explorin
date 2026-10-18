import { redirect } from '@sveltejs/kit';
import { getTrip } from '#lib/server/trips';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const trip = await getTrip(locals.uid, params.id);
	if (trip.status === 'finished') redirect(303, `/scrapbook/${trip.id}`);
	return { trip };
};
