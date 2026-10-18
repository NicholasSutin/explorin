/**
 * Google Places API (New) wrapper: one Text Search per place to find its ID, first photo,
 * coordinates and Maps link, then one Place Photo media call to turn a photo name into a
 * Google-hosted image URL. Static map images are served by src/lib/server/maps.ts.
 *
 * Billing (Oct 2026): Text Search with `places.photos` in the field mask is the Pro SKU
 * ($32 / 1k after 5k free per month). Place Details with only `location,photos` is Essentials
 * ($5 / 1k after 10k free), which is how trip pages refresh stored place ids. Landmark taps use
 * Details Pro for the name ($17 / 1k after 5k free). Photo media is "Place Details Photos"
 * ($7 / 1k after 1k free). Reviews are Enterprise + Atmosphere ($25 / 1k after 1k free), so they
 * are only fetched when someone opens them. Results are cached in memory for a day so a running
 * process pays once per place, not once per view; each billed call is recorded in the usage
 * ledger (usage.ts). Every function degrades to null instead of throwing.
 *
 * Google's terms: place ids may be stored indefinitely, coordinates for 30 days, and photos,
 * names from Places and reviews not at all. Trips therefore store the place id and refresh the
 * rest through `placeBasics` when shown (trips.ts).
 */
import { GOOGLE_MAPS_API_KEY } from '$app/env/private';
import type { Experience, LatLng } from '#lib/adventure';
import { distanceM } from '#lib/geo';
import { DAY, fetchJson, ttlCache } from './http';
import { trackCall } from './usage';

export const placesEnabled = () => Boolean(GOOGLE_MAPS_API_KEY);

const PHOTO_NAME = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;
const PLACE_ID = /^[A-Za-z0-9_-]+$/;
export const validPhotoName = (name: string) => PHOTO_NAME.test(name);

export interface PlaceLookup {
	placeId: string;
	photo?: Experience['photo'];
	coords?: Experience['coords'];
	mapsUrl?: string;
	/** Other branches of the same name from the same search (chains), for `enrichPlaces` to choose from. */
	branches?: PlaceLookup[];
}

export interface PlaceReview {
	text: string;
	rating: number | null;
	author?: string;
	/** e.g. "2 months ago" */
	when?: string;
}

export interface PlaceReviews {
	rating?: number;
	reviewCount?: number;
	reviews: PlaceReview[];
}

const placeCache = ttlCache<PlaceLookup | null>(DAY);
const uriCache = ttlCache<string>(DAY);
const reviewCache = ttlCache<PlaceReviews | null>(DAY);
const basicsCache = ttlCache<PlaceBasics | null>(DAY);
const cardCache = ttlCache<PlaceCard | null>(DAY);

export const validPlaceId = (id: string) => PLACE_ID.test(id) && id.length <= 300;

/** Coordinates and first photo for a stored place id (Place Details Essentials). */
export interface PlaceBasics {
	coords?: Experience['coords'];
	photo?: Experience['photo'];
}

/** What a tapped map landmark shows (Place Details Pro). */
export interface PlaceCard extends PlaceBasics {
	placeId: string;
	name: string;
	kind?: string;
	address?: string;
	mapsUrl?: string;
}

interface PlacePhoto {
	name: string;
	authorAttributions?: { displayName?: string; uri?: string }[];
}

function toPhoto(placeId: string, photo: PlacePhoto | undefined): Experience['photo'] {
	if (!photo || !validPhotoName(photo.name)) return undefined;
	const author = photo.authorAttributions?.[0];
	return {
		name: photo.name,
		placeId,
		attribution: author?.displayName || 'Google Maps contributor',
		attributionUrl: author?.uri && /^https:\/\//.test(author.uri) ? author.uri : undefined
	};
}

function toCoords(location?: { latitude?: number; longitude?: number }): Experience['coords'] {
	const lat = location?.latitude;
	const lng = location?.longitude;
	return typeof lat === 'number' &&
		typeof lng === 'number' &&
		Math.abs(lat) <= 90 &&
		Math.abs(lng) <= 180
		? { lat, lng }
		: undefined;
}

const headers = (fieldMask: string) => ({
	'Content-Type': 'application/json',
	'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY ?? '',
	'X-Goog-FieldMask': fieldMask
});

interface TextSearchPlace {
	id: string;
	displayName?: { text?: string };
	location?: { latitude?: number; longitude?: number };
	googleMapsUri?: string;
	photos?: { name: string; authorAttributions?: { displayName?: string; uri?: string }[] }[];
}
interface TextSearchResponse {
	places?: TextSearchPlace[];
}

function toLookup(place: TextSearchPlace): PlaceLookup {
	const value: PlaceLookup = {
		placeId: place.id,
		photo: toPhoto(place.id, place.photos?.[0]),
		coords: toCoords(place.location)
	};
	if (
		place.googleMapsUri &&
		/^https:\/\/(www\.google\.com\/maps|maps\.google\.com\/)/.test(place.googleMapsUri)
	)
		value.mapsUrl = place.googleMapsUri;
	return value;
}

const nameKey = (name?: string) => (name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
/** "Los Tacos No. 1" and "Los Tacos No.1 - Chelsea Market" are branches of one chain. */
const sameChain = (a: string, b: string) =>
	a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a));

/**
 * Find a place by free-text query, e.g. "The High Line, New York City": ID, first photo,
 * coordinates and Google Maps link, plus other same-named branches among the first five results.
 * `location` and `googleMapsUri` are Essentials fields and `displayName` is Pro, so none of them
 * add to the Pro SKU that `places.photos` already triggers; the price is per request, whatever
 * the page size.
 */
export async function findPlace(query: string): Promise<PlaceLookup | null> {
	if (!placesEnabled() || !query.trim()) return null;
	const key = query.trim().toLowerCase();
	const hit = placeCache.get(key);
	if (hit !== undefined) return hit;
	trackCall('places.text_search_pro', 'place.find');
	const data = await fetchJson<TextSearchResponse>(
		'https://places.googleapis.com/v1/places:searchText',
		{
			method: 'POST',
			headers: headers(
				'places.id,places.displayName,places.photos,places.location,places.googleMapsUri'
			),
			body: JSON.stringify({ textQuery: query, pageSize: 5 })
		}
	);
	if (!data) return null; // request failed: do not remember that for a day
	const [place, ...others] = (data.places ?? []).filter((p) => PLACE_ID.test(p.id));
	if (!place) return placeCache.set(key, null);
	const name = nameKey(place.displayName?.text);
	const branches = others
		.filter((p) => sameChain(name, nameKey(p.displayName?.text)))
		.map(toLookup)
		.filter((b) => b.coords);
	return placeCache.set(key, { ...toLookup(place), ...(branches.length ? { branches } : {}) });
}

/** Resolve a photo resource name to a Google-hosted image URL (lh3.googleusercontent.com). */
export async function photoUri(name: string, maxWidthPx = 900): Promise<string | null> {
	if (!placesEnabled() || !validPhotoName(name)) return null;
	const key = `${name}@${maxWidthPx}`;
	const hit = uriCache.get(key);
	if (hit) return hit;
	trackCall('places.photo', 'place.photo');
	const data = await fetchJson<{ photoUri?: string }>(
		`https://places.googleapis.com/v1/${name}/media?maxWidthPx=${maxWidthPx}&skipHttpRedirect=true&key=${GOOGLE_MAPS_API_KEY}`
	);
	const uri = data?.photoUri;
	if (!uri || !/^https:\/\/[a-z0-9.-]+\.googleusercontent\.com\//.test(uri)) return null;
	return uriCache.set(key, uri);
}

interface DetailsResponse {
	rating?: number;
	userRatingCount?: number;
	reviews?: {
		rating?: number;
		text?: { text?: string };
		relativePublishTimeDescription?: string;
		authorAttribution?: { displayName?: string };
	}[];
}

/** Up to 5 most-relevant Google reviews plus rating for a place ID. Enterprise + Atmosphere SKU. */
export async function placeReviews(placeId: string): Promise<PlaceReviews | null> {
	if (!placesEnabled() || !PLACE_ID.test(placeId)) return null;
	const hit = reviewCache.get(placeId);
	if (hit !== undefined) return hit;
	trackCall('places.details_reviews', 'place.reviews');
	const data = await fetchJson<DetailsResponse>(
		`https://places.googleapis.com/v1/places/${placeId}`,
		{
			headers: headers('rating,userRatingCount,reviews')
		}
	);
	if (!data) return null; // request failed: do not remember that for a day
	return reviewCache.set(placeId, {
		rating: typeof data.rating === 'number' ? data.rating : undefined,
		reviewCount: typeof data.userRatingCount === 'number' ? data.userRatingCount : undefined,
		reviews: (data.reviews ?? [])
			.map((r) => ({
				text: (r.text?.text ?? '').trim().slice(0, 600),
				rating: typeof r.rating === 'number' ? r.rating : null,
				author: r.authorAttribution?.displayName || undefined,
				when: r.relativePublishTimeDescription || undefined
			}))
			.filter((r) => r.text.length > 20)
			.slice(0, 5)
	});
}

/** Seed the basics cache from a Text Search the planner just paid for, so the trip page does not pay again. */
export function primeBasics(placeId: string, basics: PlaceBasics) {
	if (validPlaceId(placeId) && basicsCache.get(placeId) === undefined)
		basicsCache.set(placeId, basics);
}

/** Coordinates and first photo for a stored place id. Essentials SKU: the cheap way to refresh a trip. */
export async function placeBasics(placeId: string): Promise<PlaceBasics | null> {
	if (!placesEnabled() || !validPlaceId(placeId)) return null;
	const hit = basicsCache.get(placeId);
	if (hit !== undefined) return hit;
	trackCall('places.details_essentials', 'place.refresh');
	const data = await fetchJson<{
		location?: { latitude?: number; longitude?: number };
		photos?: PlacePhoto[];
	}>(`https://places.googleapis.com/v1/places/${placeId}`, { headers: headers('location,photos') });
	if (!data) return null;
	return basicsCache.set(placeId, {
		coords: toCoords(data.location),
		photo: toPhoto(placeId, data.photos?.[0])
	});
}

/** Name, kind, address, photo and location for a landmark tapped on the map. Details Pro SKU. */
export async function placeCard(placeId: string): Promise<PlaceCard | null> {
	if (!placesEnabled() || !validPlaceId(placeId)) return null;
	const hit = cardCache.get(placeId);
	if (hit !== undefined) return hit;
	trackCall('places.details_pro', 'place.landmark');
	const data = await fetchJson<{
		displayName?: { text?: string };
		primaryTypeDisplayName?: { text?: string };
		shortFormattedAddress?: string;
		googleMapsUri?: string;
		location?: { latitude?: number; longitude?: number };
		photos?: PlacePhoto[];
	}>(`https://places.googleapis.com/v1/places/${placeId}`, {
		headers: headers(
			'displayName,primaryTypeDisplayName,shortFormattedAddress,googleMapsUri,location,photos'
		)
	});
	if (!data?.displayName?.text) return data ? cardCache.set(placeId, null) : null;
	return cardCache.set(placeId, {
		placeId,
		name: data.displayName.text,
		kind: data.primaryTypeDisplayName?.text,
		address: data.shortFormattedAddress,
		mapsUrl:
			data.googleMapsUri &&
			/^https:\/\/(www\.google\.com\/maps|maps\.google\.com\/)/.test(data.googleMapsUri)
				? data.googleMapsUri
				: undefined,
		coords: toCoords(data.location),
		photo: toPhoto(placeId, data.photos?.[0])
	});
}

type Enrichable = Pick<
	Experience,
	'photo' | 'coords' | 'mapsUrl' | 'placeQuery' | 'location' | 'title' | 'placeId'
>;

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

/**
 * Attach place id, photo, coordinates and Maps link to each item with one Text Search apiece. For a chain, the
 * branch nearest the other items wins (the middle of the rest of the day), not Google's first hit, which for
 * "Los Tacos No.1" is Times Square even when every other stop is in Chelsea. Never throws; items pass through
 * untouched on failure or without a Places key. Reviews are not fetched here (they are the expensive SKU); the
 * trip page loads them when a stop is opened.
 */
export async function enrichPlaces<T extends Enrichable>(items: T[]): Promise<T[]> {
	if (!placesEnabled()) return items;
	const found = await Promise.all(
		items.map((item) => findPlace(item.placeQuery || `${item.title} ${item.location}`))
	);
	return items.map((item, i) => {
		let place = found[i];
		if (!place) return item;
		const others = found.flatMap((f, j) => (j !== i && f?.coords ? [f.coords] : []));
		if (place.branches?.length && others.length >= 2) {
			const middle: LatLng = {
				lat: median(others.map((c) => c.lat)),
				lng: median(others.map((c) => c.lng))
			};
			const away = (p: PlaceLookup) => (p.coords ? distanceM(middle, p.coords) : Infinity);
			place = [place, ...place.branches].reduce((a, b) => (away(b) < away(a) ? b : a));
		}
		return {
			...item,
			placeId: item.placeId ?? place.placeId,
			photo: item.photo ?? place.photo,
			coords: item.coords ?? place.coords,
			mapsUrl: item.mapsUrl ?? place.mapsUrl
		};
	});
}
