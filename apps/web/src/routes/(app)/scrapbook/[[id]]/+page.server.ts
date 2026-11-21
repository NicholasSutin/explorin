import { getTaste } from '#lib/server/taste';
import { scrapbookTrips } from '#lib/server/trips';
import { getBookLook } from '#lib/server/scrapbook';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const user = locals.user!;
	const [trips, taste, look] = await Promise.all([
		scrapbookTrips(user.id),
		getTaste(user.id),
		getBookLook(user.id)
	]);
	return {
		trips,
		look,
		openId: params.id ?? null,
		flip: taste?.flipAnimations ?? true,
		name: user.name?.split(' ')[0] ?? ''
	};
};
