import { startersFor } from '#lib/taste';
import { getTaste } from '#lib/server/taste';
import { currentTrip, listTrips } from '#lib/server/trips';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user!;
	const [taste, current, recent] = await Promise.all([
		getTaste(user.id),
		currentTrip(user.id),
		listTrips(user.id, 4)
	]);
	return {
		name: user.name?.split(' ')[0] ?? '',
		homeCity: (user.homeCity as string | null | undefined) || 'New York City',
		starters: startersFor(taste?.grades ?? {}),
		current,
		recent: recent.filter((t) => t.id !== current?.id).slice(0, 3)
	};
};
