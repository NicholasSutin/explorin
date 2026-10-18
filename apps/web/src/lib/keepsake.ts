/** Vocabulary for the post-trip step, shared by the server prompt and the UI. */

/** "Who is this day best for?" The AI suggests six of these; the person keeps up to three. */
export const BEST_FOR = [
	'For slow walkers',
	'For foodies',
	'For athletic people',
	'For young people',
	'For older people',
	'For families',
	'For first-timers',
	'For photographers',
	'For art lovers',
	'For history buffs',
	'For nature lovers',
	'For coffee people',
	'For night owls',
	'For early risers',
	'For budget explorers',
	'For date night',
	'For solo explorers',
	'For groups of friends',
	'For rainy days',
	'For shoppers'
] as const;
export const BEST_FOR_SUGGESTED = 6;
export const BEST_FOR_MAX = 3;

export const EMOTIONS = [
	'awe',
	'calm',
	'nostalgia',
	'pride',
	'joy',
	'belonging',
	'gratitude',
	'exhilaration',
	'curiosity',
	'cozy'
] as const;

/** What the AI drafts from the note, before the person picks their tags. */
export interface KeepsakeDraft {
	title: string;
	story: string;
	emotions: string[];
	/** One sentence from the note, close to verbatim, that someone like them could read later. */
	quote: string;
	bestForOptions: string[];
	aiGenerated: boolean;
}
