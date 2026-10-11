import { EMOTIONS } from '#lib/types';

const str = { type: 'STRING' } as const;
const strArr = { type: 'ARRAY', items: str } as const;

export const PROFILE_SYSTEM = `You are building an outdoor-experience profile from a person's photos and optional bio.
Infer only activity, scenery, pace, and mood preferences that are visibly supported.
For every activity give the photo number or bio phrase as evidence and a confidence 0 to 1.
Never infer health, religion, ethnicity, sexuality, politics, or income.
If evidence is thin, return fewer traits rather than guessing.
Write the summary as one warm paragraph in second person ("You ...") describing who this person is outdoors.`;

export const PROFILE_SCHEMA = {
	type: 'OBJECT',
	properties: {
		activities: {
			type: 'ARRAY',
			items: {
				type: 'OBJECT',
				properties: { name: str, confidence: { type: 'NUMBER' }, evidence: str },
				required: ['name', 'confidence', 'evidence']
			}
		},
		scenery: strArr,
		pace: { type: 'STRING', enum: ['chill', 'moderate', 'active'] },
		social: { type: 'STRING', enum: ['solo', 'small_group', 'crowd'] },
		time_of_day: strArr,
		values: strArr,
		avoid: strArr,
		summary: str
	},
	required: ['activities', 'scenery', 'pace', 'social', 'time_of_day', 'values', 'avoid', 'summary']
};

export const INTENT_SYSTEM = `You parse a request for an on-the-ground experience in New York City into structured intent.
If the request combines things that rarely coexist in NYC (for example Atlantic Ocean views plus the Empire State Building),
set feasibility_note to an honest one-sentence explanation and the closest real alternative. Otherwise feasibility_note is null.
search_query should be a concise web/maps search phrase that would find real places for this request.`;

export const INTENT_SCHEMA = {
	type: 'OBJECT',
	properties: {
		activity: str,
		duration_or_distance: { type: 'STRING', nullable: true },
		must_see: strArr,
		vibe: str,
		time_window: str,
		feasibility_note: { type: 'STRING', nullable: true },
		search_query: str
	},
	required: ['activity', 'must_see', 'vibe', 'time_window', 'search_query']
};

export const COMPOSE_SYSTEM = `Recommend at most 3 experiences for this person.
Use only place_id values from CANDIDATES and only quote_ids from EVIDENCE. Never write quote text yourself.
Prefer places that have evidence. Prefer evidence whose author resembles the user and say how they are similar.
In why_for_you, name at least one of the user's traits explicitly.
If nothing satisfies a must_see, say so in feasibility_note and offer the closest match.
right_now: if LIVE has hours or busyness for the place, write one short line like "Open until 1 AM, usually quiet at this hour." Otherwise null.
Titles are short and specific ("Sunrise loop at Gantry Plaza"). plan is 2 to 3 sentences: where to start, which way to go, where to stop.`;

export const COMPOSE_SCHEMA = {
	type: 'OBJECT',
	properties: {
		feasibility_note: { type: 'STRING', nullable: true },
		cards: {
			type: 'ARRAY',
			items: {
				type: 'OBJECT',
				properties: {
					place_id: str,
					title: str,
					plan: str,
					why_for_you: str,
					quote_ids: strArr,
					right_now: { type: 'STRING', nullable: true }
				},
				required: ['place_id', 'title', 'plan', 'why_for_you', 'quote_ids']
			}
		}
	},
	required: ['cards']
};

export const REFLECT_SYSTEM = `You analyze how an experience made someone feel, from their photo and words.
emotions must be chosen only from: ${EMOTIONS.join(', ')}.
quote is the single most quotable sentence in the user's own words, lightly trimmed, under 30 words.
profile_updates lists only new, clearly supported preferences.
learned is a short friendly toast such as "You love sunrise runs by the water."`;

export const REFLECT_SCHEMA = {
	type: 'OBJECT',
	properties: {
		emotions: { type: 'ARRAY', items: { type: 'STRING', enum: [...EMOTIONS] } },
		themes: strArr,
		quote: str,
		profile_updates: {
			type: 'OBJECT',
			properties: { add_scenery: strArr, add_values: strArr, add_activities: strArr },
			required: ['add_scenery', 'add_values', 'add_activities']
		},
		learned: str
	},
	required: ['emotions', 'themes', 'quote', 'profile_updates', 'learned']
};

export const INGEST_SYSTEM = `From these public reviews of one place, pick up to 3 sentences that express how the place made someone FEEL
(not logistics, not complaints about parking or prices). Return each as a short excerpt under 25 words, close to the reviewer's words.
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

export const EXTRACT_REVIEWS_SYSTEM = `You are given the text of a review page (Yelp or Tripadvisor). Extract individual customer reviews as plain text.
Return up to 20 reviews. Skip navigation, ads, and business responses. Keep each review under 600 characters.`;

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

export const PLACE_NAMES_SCHEMA = {
	type: 'OBJECT',
	properties: { names: strArr },
	required: ['names']
};
