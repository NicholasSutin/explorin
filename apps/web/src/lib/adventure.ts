/** Shapes shared by the planner, the trip map, the reflection step and the scrapbook. */

export interface LatLng {
	lat: number;
	lng: number;
}
/** "lat,lng" at 6 decimals: the format /api/map, Static Maps and directions links all take. */
export const formatLatLng = (p: LatLng) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;

export interface ExperiencePhoto {
	/** Places API photo resource name: places/{placeId}/photos/{ref}. Resolved by /api/photo. Never stored. */
	name: string;
	placeId: string;
	/** Required by Google's attribution policy; shown next to the image. */
	attribution: string;
	attributionUrl?: string;
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

/** A place the planner proposes, before it becomes a trip stop. */
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
	/** Two or three short tags from TAGS, e.g. "hidden gem", "great views". */
	tags?: string[];
	/** Free-text query used to look the place up in Google Places (defaults to title + location). */
	placeQuery?: string;
	placeId?: string;
	photo?: ExperiencePhoto;
	coords?: LatLng;
	mapsUrl?: string;
	voices?: PlaceVoice[];
}

/** Tags the planner may put on a stop; a fixed list so the map can filter by them. */
export const TAGS = [
	'hidden gem',
	'great views',
	'budget-friendly',
	'splurge',
	'quiet',
	'lively',
	'photogenic',
	'iconic',
	'local favorite',
	'good for groups',
	'date-worthy',
	'kid-friendly',
	'rainy-day ok',
	'outdoors',
	'quick stop',
	'linger'
] as const;

/** A public event near the trip, from NYC Open Data (happenings.ts). */
export interface Happening {
	id: string;
	name: string;
	/** Permit type, e.g. "Farmers Market", "Street Festival". */
	kind: string;
	/** NYC local wall-clock "YYYY-MM-DDTHH:MM:SS". */
	starts: string;
	ends: string;
	where: string;
	lat: number;
	lng: number;
	/** Index of the closest stop and how far it is. */
	nearStop?: number;
	distanceM?: number;
}

export interface Stop {
	id: string;
	position: number;
	placeId?: string;
	title: string;
	place: string;
	description: string;
	reason: string;
	category: string;
	tags: string[];
	/** Where the planner read about it. */
	url?: string;
	coords?: LatLng;
	/** Fetched by place id when the trip is shown; Google's terms forbid storing it. */
	photo?: ExperiencePhoto;
	mapsUrl?: string;
	voices?: PlaceVoice[];
	inPlan: boolean;
	addedBy: 'ai' | 'user';
	visitedAt: string | null;
	/** The person's own GPS fix when they checked in, if they shared location. */
	visitedFrom?: LatLng | null;
}

export type TripStatus = 'planned' | 'active' | 'finished';
export type DayWindow = 'now' | 'morning' | 'afternoon' | 'evening' | 'all_day';
export const DAY_WINDOWS: { id: DayWindow; label: string }[] = [
	{ id: 'now', label: 'Right now' },
	{ id: 'morning', label: 'Morning' },
	{ id: 'afternoon', label: 'Afternoon' },
	{ id: 'evening', label: 'Evening' },
	{ id: 'all_day', label: 'All day' }
];

export interface Trip {
	id: string;
	prompt: string;
	city: string;
	window: DayWindow;
	title: string | null;
	status: TripStatus;
	happenings: Happening[];
	note: string | null;
	photoUrls: string[];
	bestFor: string[];
	bestForOptions: string[];
	storyTitle: string | null;
	story: string | null;
	emotions: string[];
	highlightStopId: string | null;
	createdAt: string;
	startedAt: string | null;
	finishedAt: string | null;
	stops: Stop[];
}

/** One stage of the planning pipeline, streamed from /api/plan so the UI can show the work. */
export interface DiscoveryStep {
	id:
		'locate' | 'taste' | 'search' | 'ai' | 'places' | 'route' | 'happenings' | 'people' | 'curated';
	label: string;
	state: 'running' | 'done' | 'skipped' | 'failed';
	/** One line of what happened, e.g. "8 pages read". */
	detail?: string;
	/** Short list of what the stage produced: page titles, place names. */
	items?: string[];
	ms?: number;
}

/**
 * Hand-off links for one stop. Both open the native app on phones. Walking unless the stop is far, then transit.
 * https://developers.google.com/maps/documentation/urls/get-started
 * https://developer.apple.com/library/archive/featuredarticles/iPhoneURLScheme_Reference/MapLinks/MapLinks.html
 */
export function directionsLinks(
	to: LatLng,
	{ placeId, name, transit = false }: { placeId?: string; name?: string; transit?: boolean } = {}
) {
	const g = new URLSearchParams({
		api: '1',
		destination: formatLatLng(to),
		travelmode: transit ? 'transit' : 'walking'
	});
	if (placeId) g.set('destination_place_id', placeId);
	const a = new URLSearchParams({ daddr: formatLatLng(to), dirflg: transit ? 'r' : 'w' });
	if (name) a.set('q', name);
	return {
		google: `https://www.google.com/maps/dir/?${g.toString()}`,
		apple: `https://maps.apple.com/?${a.toString()}`
	};
}

/** Curated NYC places used when live search is unavailable, so a plan still has real stops. */
export const curatedExperiences: Experience[] = [
	{
		id: 'high-line',
		place: 'The High Line',
		title: 'A little above the everyday',
		location: 'The High Line · New York City',
		description: 'An elevated garden walk with public art and river glimpses.',
		placeQuery: 'The High Line, New York, NY',
		url: 'https://www.thehighline.org/',
		category: 'Park walk',
		reason: 'An easygoing mix of green space, art and wandering.',
		tags: ['great views', 'outdoors', 'iconic']
	},
	{
		id: 'chelsea-market',
		place: 'Chelsea Market',
		title: 'Graze your way through',
		location: 'Chelsea Market · New York City',
		description: 'A food hall in an old biscuit factory, good for a small bite between walks.',
		placeQuery: 'Chelsea Market, New York, NY',
		url: 'https://www.chelseamarket.com/',
		category: 'Food hall',
		reason: 'Lots of small bites in one stop, rain or shine.',
		tags: ['lively', 'rainy-day ok', 'quick stop']
	},
	{
		id: 'little-island',
		place: 'Little Island',
		title: 'Sunset over the Hudson',
		location: 'Little Island · New York City',
		description: 'A sculpted park on the river with lawns, lookouts and free performances.',
		placeQuery: 'Little Island, New York, NY',
		url: 'https://littleisland.org/',
		category: 'Park',
		reason: 'Water views and a place to sit without spending a thing.',
		tags: ['photogenic', 'budget-friendly', 'outdoors']
	},
	{
		id: 'whitney',
		place: 'Whitney Museum of American Art',
		title: 'Art with terraces',
		location: 'Whitney Museum of American Art · New York City',
		description: 'American art inside, outdoor terraces with skyline views on every floor.',
		placeQuery: 'Whitney Museum of American Art, New York, NY',
		url: 'https://whitney.org/',
		category: 'Museum',
		reason: 'A thoughtful hour of art that ends on a view.',
		tags: ['rainy-day ok', 'great views', 'linger']
	},
	{
		id: 'washington-square',
		place: 'Washington Square Park',
		title: 'Watch the city perform',
		location: 'Washington Square Park · New York City',
		description: 'Musicians, chess players and the arch: the best people-watching downtown.',
		placeQuery: 'Washington Square Park, New York, NY',
		url: 'https://www.nycgovparks.org/parks/washington-square-park',
		category: 'Park',
		reason: 'Something is always going on, and it costs nothing.',
		tags: ['lively', 'budget-friendly', 'local favorite']
	}
];
