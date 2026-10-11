export const EMOTIONS = [
	'awe',
	'calm',
	'nostalgia',
	'pride',
	'joy',
	'belonging',
	'gratitude',
	'exhilaration'
] as const;
export type Emotion = (typeof EMOTIONS)[number];

export type Source = 'user' | 'public_review' | 'tripadvisor_review' | 'yelp_review' | 'seed';

export interface Activity {
	name: string;
	confidence: number;
	evidence: string;
}

export interface Traits {
	activities: Activity[];
	scenery: string[];
	pace: 'chill' | 'moderate' | 'active';
	social: 'solo' | 'small_group' | 'crowd';
	time_of_day: string[];
	values: string[];
	avoid: string[];
	summary: string;
}

export interface Profile {
	user_id: string;
	name: string | null;
	traits: Traits;
	summary: string | null;
	updated_at: string;
}

export interface Intent {
	activity: string;
	duration_or_distance: string | null;
	must_see: string[];
	vibe: string;
	time_window: string;
	feasibility_note: string | null;
	search_query: string;
}

export interface Place {
	id: string;
	google_place_id: string | null;
	name: string;
	kind: string | null;
	lat: number | null;
	lng: number | null;
	tags: string[];
	notes: string | null;
	maps_url: string | null;
}

export interface Quote {
	id: string;
	quote: string;
	display_name: string;
	source: Source;
	emotions: string[];
}

export interface Card {
	experience_id: string;
	place_id: string;
	place_name: string;
	google_place_id: string | null;
	maps_url: string | null;
	title: string;
	plan: string;
	why_for_you: string;
	quotes: Quote[];
	right_now: string | null;
}

export interface RecommendResponse {
	feasibility_note: string | null;
	cards: Card[];
	attribution: 'google_maps' | null;
}

export interface ReflectionAnalysis {
	emotions: Emotion[];
	themes: string[];
	quote: string;
	profile_updates: { add_scenery: string[]; add_values: string[]; add_activities: string[] };
	learned: string;
}

export function sourceLabel(s: Source): string {
	switch (s) {
		case 'user':
			return 'From someone like you';
		case 'tripadvisor_review':
			return 'From Tripadvisor reviews';
		case 'yelp_review':
			return 'From Yelp reviews';
		case 'public_review':
			return 'From public reviews';
		case 'seed':
			return 'From seed notes';
		default:
			return 'From public reviews';
	}
}
