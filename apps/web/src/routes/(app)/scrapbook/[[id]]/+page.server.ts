import { getTaste } from '#lib/server/taste';
import { scrapbookTrips } from '#lib/server/trips';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const user = locals.user!;
	const [trips, taste] = await Promise.all([scrapbookTrips(user.id), getTaste(user.id)]);
	return {
		trips,
		openId: params.id ?? null,
		flip: taste?.flipAnimations ?? true,
		name: user.name?.split(' ')[0] ?? ''
	};
};
