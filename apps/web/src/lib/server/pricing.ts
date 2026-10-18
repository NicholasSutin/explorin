/**
 * List prices used to estimate what each upstream call costs, in micro-dollars (1e-6 USD). These are pay-as-you-go
 * rates after the free monthly allowances, so the real bill is usually lower (often $0 at this scale). Adjust here
 * when a provider's pricing changes; nothing else hard-codes a price.
 *
 * Sources (checked Oct 2026): Google Maps Platform pricing page per SKU; Gemini API pricing for the Flash tier;
 * Nimble's per-request search pricing is plan-dependent, so it is a conservative guess.
 */

/** Gemini Flash, per million tokens. Thinking tokens bill as output. */
export const GEMINI_INPUT_PER_M = 300_000;
export const GEMINI_OUTPUT_PER_M = 2_500_000;
/** gemini-embedding, per million input tokens. */
export const EMBED_PER_M = 150_000;

/** Flat per-call prices. */
export const PER_CALL = {
	'nimble.search': 3_000,
	'nimble.extract': 10_000,
	'nimble.maps_place': 3_000,
	'places.text_search_pro': 32_000,
	'places.details_essentials': 5_000,
	'places.details_pro': 17_000,
	'places.details_reviews': 25_000,
	'places.photo': 7_000,
	'maps.static': 2_000,
	'maps.dynamic_load': 7_000,
	'geocoding.google': 5_000
} as const;
export type PricedCall = keyof typeof PER_CALL;

/** 1 credit = $0.001, so credits = micro-dollars / 1000. */
export const MICROS_PER_CREDIT = 1_000;
