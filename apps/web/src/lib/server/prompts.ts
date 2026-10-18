import { EMOTIONS } from '#lib/keepsake';

const str = { type: 'STRING' } as const;
const strArr = { type: 'ARRAY', items: str } as const;

export const INGEST_SYSTEM = `From these public reviews of one place, pick up to 3 sentences that express how the place made someone FEEL
(not logistics, not complaints about parking or prices). Return each as an excerpt of 7 to 25 words, close to the reviewer's words. Skip bland lines like 'good place to rest'.
emotions only from: ${EMOTIONS.join(', ')}. themes are 1 to 3 short nouns (skyline, family, sunrise).`;

export const INGEST_SCHEMA = {
	type: 'OBJECT',
	properties: {
		excerpts: {
			type: 'ARRAY',
			items: {
				type: 'OBJECT',
				properties: {
					quote: str,
					emotions: { type: 'ARRAY', items: { type: 'STRING', enum: [...EMOTIONS] } },
					themes: strArr
				},
				required: ['quote', 'emotions', 'themes']
			}
		}
	},
	required: ['excerpts']
};

export const EXTRACT_REVIEWS_SYSTEM = `You are given the text of a Tripadvisor (or similar) review page for ONE specific place, named in the first line.
Extract only visitor reviews that are clearly about THAT place. Ignore reviews of hotels, tours, restaurants, other attractions, 'nearby' or 'recommended' listings, travel-guide articles, navigation, ads, and owner responses.
Return up to 20 reviews, each under 600 characters, as plain text. If there are no reviews about the place, return an empty list.`;

export const EXTRACT_REVIEWS_SCHEMA = {
	type: 'OBJECT',
	properties: {
		place: str,
		reviews: {
			type: 'ARRAY',
			items: {
				type: 'OBJECT',
				properties: { text: str, rating: { type: 'NUMBER', nullable: true } },
				required: ['text']
			}
		}
	},
	required: ['place', 'reviews']
};
