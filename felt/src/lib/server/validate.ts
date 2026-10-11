export interface ComposedCard {
	place_id: string;
	title: string;
	plan: string;
	why_for_you: string;
	quote_ids: string[];
	right_now?: string | null;
}

/** Drop cards with unknown place IDs, drop unknown quote IDs, dedupe places, cap at 3. */
export function validateCards(
	cards: ComposedCard[],
	placeIds: Set<string>,
	quoteIds: Set<string>
): ComposedCard[] {
	const seen = new Set<string>();
	const out: ComposedCard[] = [];
	for (const c of cards) {
		if (!placeIds.has(c.place_id) || seen.has(c.place_id)) continue;
		seen.add(c.place_id);
		out.push({
			...c,
			quote_ids: [...new Set(c.quote_ids.filter((q) => quoteIds.has(q)))].slice(0, 2),
			right_now: c.right_now?.trim() || null
		});
		if (out.length === 3) break;
	}
	return out;
}
