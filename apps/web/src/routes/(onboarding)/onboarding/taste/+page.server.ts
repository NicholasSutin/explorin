import { redirect } from '@sveltejs/kit';
import { FIRST_ROUND } from '#lib/taste';
import { getTaste, nextCategories, saveGrades } from '#lib/server/taste';
import type { PageServerLoad } from './$types';

/**
 * Onboarding 2 of 2 (also reachable from Settings to re-grade). The first visit asks Gemini which cards are
 * worth grading and stores that set as `offered`, so a reload shows the same cards instead of paying again.
 */
export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user!;
	const taste = await getTaste(user.id);
	// No blurb means About-you is not done yet. `?edit` lets onboarded accounts (Settings → Re-grade) through the guard.
	if (!taste?.blurb) redirect(303, '/onboarding?edit');
	let ids = taste.offered;
	if (!ids.length) {
		ids = await nextCategories(taste, [], FIRST_ROUND);
		await saveGrades(user.id, user.name ?? null, {}, ids);
	}
	// Cards graded somewhere else (an older round) still belong on the board.
	const all = [...new Set([...ids, ...Object.keys(taste.grades)])];
	return { ids: all, grades: taste.grades, redo: Boolean(user.onboardedAt), name: user.name ?? '' };
};
