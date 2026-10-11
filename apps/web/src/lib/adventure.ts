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
export interface PlaceReview {
	text: string;
	rating: number | null;
	author?: string;
	/** e.g. "2 months ago" */
	when?: string;
}
export interface Experience {
	id: string;
	title: string;
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
	id: 'search' | 'ai' | 'places' | 'curated';
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
