import { GOOGLE_MAPS_BROWSER_KEY } from '$app/env/public';
import { getTrip } from '#lib/server/trips';
import { trackCall } from '#lib/server/usage';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const trip = await getTrip(locals.uid, params.id, { photos: true });
	// The browser loads the map itself; record the load here so it shows in the person's usage.
	if (GOOGLE_MAPS_BROWSER_KEY) trackCall('maps.dynamic_load', 'trip.map');
	return { trip, mapsKey: GOOGLE_MAPS_BROWSER_KEY };
};
