export interface ExperiencePhoto {
	/** Places API photo resource name: places/{placeId}/photos/{ref}. Resolved by /api/photo. */
	name: string;
	placeId: string;
	/** Required by Google's attribution policy; shown next to the image. */
	attribution: string;
	attributionUrl?: string;
}
export interface LatLng {
	lat: number;
	lng: number;
}
/** "lat,lng" at 6 decimals: the format /api/map, Static Maps and directions links all take. */
export const formatLatLng = (p: LatLng) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
/** Google Maps directions deep link: free, no key, opens the native app on phones. */
export function directionsUrl(coords: LatLng, placeId?: string): string {
	const q = new URLSearchParams({ api: '1', destination: formatLatLng(coords) });
	if (placeId) q.set('destination_place_id', placeId);
	return `https://www.google.com/maps/dir/?${q.toString()}`;
}
export interface PlaceReview {
	text: string;
	rating: number | null;
	author?: string;
	/** e.g. "2 months ago" */
	when?: string;
}
/** A first-person quote from the profile side ("people like you"), matched to a place. */
export interface PlaceVoice {
	id: string;
	quote: string;
	/** "Maya, running" or "Google Maps reviewer". */
	who: string;
	source: 'user' | 'public_review' | 'tripadvisor_review' | 'yelp_review' | 'seed';
	emotions: string[];
}
export interface Experience {
	id: string;
	title: string;
	/** Venue name on its own, e.g. "The High Line". */
	place: string;
	/** Display string, "<place> · <city>". */
	location: string;
	description: string;
	url: string;
	category: string;
	reason: string;
	/** True when `reason` was rewritten by Gemini from the user's About you context. */
	personalized?: boolean;
	/** Free-text query used to look the place up in Google Places (defaults to title + location). */
	placeQuery?: string;
	photo?: ExperiencePhoto;
	/** Place coordinates from Google Places; drives /api/map thumbnails and directions links. */
	coords?: LatLng;
	/** Google Maps page for the place (no API key needed to open). */
	mapsUrl?: string;
	/** Google rating 1-5 and total count, when known. */
	rating?: number;
	reviewCount?: number;
	/** Up to 5 reviews, Google "most relevant" order (Places) or Nimble Maps fallback. */
	reviews?: PlaceReview[];
	reviewSource?: 'google-places' | 'nimble';
	/** Up to two quotes from people like the asker who have been here, when the evidence database is configured. */
	voices?: PlaceVoice[];
}
export interface Adventure {
	id: string;
	experience: Experience;
	startedAt: string;
	finishedAt: string;
	reflections: string[];
	photos: string[];
	title: string;
	summary: string;
	shareInsights: boolean;
	aiGenerated: boolean;
}
export const HISTORY_KEY = 'explorin.history.v1';
/** One stage of the discovery pipeline, streamed from /api/discover so the UI can show the work. */
export interface DiscoveryStep {
	id: 'search' | 'ai' | 'places' | 'people' | 'curated';
	label: string;
	state: 'running' | 'done' | 'skipped' | 'failed';
	/** One line of what happened, e.g. "8 pages read". */
	detail?: string;
	/** Short list of what the stage produced: page titles, place names. */
	items?: string[];
	ms?: number;
}
export const demoExperiences: Experience[] = [
	{
		id: 'high-line',
		place: 'The High Line',
		title: 'A little above the everyday',
		location: 'The High Line · New York City',
		description:
			'Follow an elevated garden through the city. Pause for public art, unexpected views, and a moment to yourself.',
		placeQuery: 'The High Line, New York, NY',
		url: 'https://www.thehighline.org/',
		category: 'Nature & art',
		reason: 'An easygoing mix of green space, creativity, and wandering.'
	},
	{
		id: 'brooklyn',
		place: 'Brooklyn Bridge Park',
		title: 'Chase the waterfront light',
		location: 'Brooklyn Bridge Park · New York City',
		description:
			'Wander the waterfront paths and find a skyline spot for a slow afternoon. Bring a camera and leave room for a detour.',
		placeQuery: 'Brooklyn Bridge Park, Brooklyn, NY',
		url: 'https://www.brooklynbridgepark.org/',
		category: 'Outdoors',
		reason: 'Open skies and a fresh perspective, without leaving the city.'
	},
	{
		id: 'museum',
		place: 'The Metropolitan Museum of Art',
		title: 'Get wonderfully lost in art',
		location: 'The Metropolitan Museum of Art · New York City',
		description:
			'Pick one gallery that catches your eye and let curiosity lead. Check the official site for admission and opening hours.',
		placeQuery: 'The Metropolitan Museum of Art, New York, NY',
		url: 'https://www.metmuseum.org/',
		category: 'Culture',
		reason: 'A thoughtful escape for a curious, creative afternoon.'
	}
];
