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

/**
 * What the AI suggests from the note, before the person picks their tags. There is no story: the page carries the
 * person's own note, and the AI never writes words that are shown as theirs.
 */
export interface KeepsakeDraft {
	title: string;
	emotions: string[];
	/** A line copied from the note word for word (`inNote`), that someone like them could read later; or ''. */
	quote: string;
	bestForOptions: string[];
	/** Up to two phrases the note reveals about their taste; remembered only if the person keeps them. */
	learned: string[];
	aiGenerated: boolean;
}

/** A shared line is at least this many characters and words; anything shorter says little to someone else. */
export const QUOTE_MIN = 10;
const QUOTE_MIN_WORDS = 3;
export const QUOTE_MAX = 240;

const QUOTES = /^["'“”‘’«»]+|["'“”‘’«»]+$/g;
const WORDY = /[\p{L}\p{N}]/u;

/** Where `needle` occurs in `hay`, ignoring case when lower-casing keeps both lengths (so the indexes fit `hay`). */
function* occurrences(hay: string, needle: string) {
	const [h, n] = [hay.toLowerCase(), needle.toLowerCase()];
	const [a, b] = h.length === hay.length && n.length === needle.length ? [h, n] : [hay, needle];
	for (let at = a.indexOf(b); at >= 0; at = a.indexOf(b, at + 1)) yield at;
}

/**
 * `pick` exactly as the note has it (the note's own spelling and case), or '' when the note doesn't contain it word
 * for word. Only spacing, case, wrapping quotation marks and a closing full stop are forgiven, and the match must
 * start and end on whole words. Shared quotes are always run through this, so they are the person's own words.
 */
export function inNote(note: string, pick: string): string {
	const text = note.replace(/\s+/g, ' ').trim();
	const want = pick.replace(/\s+/g, ' ').trim().replace(QUOTES, '').trim();
	for (const w of new Set([want, want.replace(/[.!?]$/, '')])) {
		if (w.length < QUOTE_MIN || w.split(' ').length < QUOTE_MIN_WORDS) continue;
		for (const at of occurrences(text, w)) {
			let end = at + w.length;
			if (WORDY.test(text[at - 1] ?? '') || WORDY.test(text[end] ?? '')) continue;
			while (/[.!?]/.test(text[end] ?? '')) end++; // keep the note's own closing punctuation
			const span = text.slice(at, end);
			return span.length <= QUOTE_MAX ? span : '';
		}
	}
	return '';
}

/** The first sentence of the note that can be shared as it is; '' when none fits. */
export function firstQuotable(note: string): string {
	for (const s of note
		.replace(/\s+/g, ' ')
		.trim()
		.split(/(?<=[.!?])\s+/)) {
		const q = inNote(note, s);
		if (q) return q;
	}
	return '';
}
