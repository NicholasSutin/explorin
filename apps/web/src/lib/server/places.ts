/**
 * Google Places API (New) wrapper: one Text Search per place to find its ID, first photo,
 * coordinates and Maps link, then one Place Photo media call to turn a photo name into a
 * Google-hosted image URL. Static map images are served by src/lib/server/maps.ts.
 *
 * Billing (Oct 2026): Text Search with `places.photos` in the field mask is the Pro SKU
 * ($32 / 1k after 5k free per month). Photo media is "Place Details Photos" ($7 / 1k after
 * 1k free per month). Place Details with `reviews` is Enterprise + Atmosphere ($25 / 1k after
 * 1k free per month) and returns at most 5 reviews in Google's relevance order; there is no
 * sort parameter in the New API. All results are cached in memory so a running server pays
 * once per place, not once per page view. Every function degrades to null instead of throwing.
 * Reviews fall back to Nimble's google_maps_reviews when Places is off but Nimble Web API is on.
 */
import { GOOGLE_MAPS_API_KEY } from '$app/env/private';
import type { ExperiencePhoto, LatLng, PlaceReview } from '#lib/adventure';
import { mapsReviews, nimbleMapsEnabled } from '#lib/server/nimble';

export const placesEnabled = () => Boolean(GOOGLE_MAPS_API_KEY);

const PHOTO_NAME = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;
export const validPhotoName = (name: string) => PHOTO_NAME.test(name);

const DAY = 24 * 60 * 60 * 1000;
const placeCache = new Map<string, { at: number; value: PlaceLookup | null }>();
const uriCache = new Map<string, { at: number; value: string }>();
const reviewCache = new Map<string, { at: number; value: PlaceReviews | null }>();

export interface PlaceLookup {
	placeId: string;
	photo?: ExperiencePhoto;
	coords?: LatLng;
	mapsUrl?: string;
}

export interface PlaceReviews {
	rating?: number;
	reviewCount?: number;
	reviews: PlaceReview[];
}

async function get<T>(
	url: string,
	timeoutMs = 8000,
	headers: Record<string, string> = {}
): Promise<T | null> {
	if (!GOOGLE_MAPS_API_KEY) return null;
	const ctrl = new AbortController();
	const t = setTimeout(() => ctrl.abort(), timeoutMs);
	try {
		const res = await fetch(url, { signal: ctrl.signal, headers });
		return res.ok ? ((await res.json()) as T) : null;
	} catch {
		return null;
	} finally {
		clearTimeout(t);
	}
}

interface TextSearchResponse {
	places?: {
		id: string;
		location?: { latitude?: number; longitude?: number };
		googleMapsUri?: string;
		photos?: { name: string; authorAttributions?: { displayName?: string; uri?: string }[] }[];
	}[];
}

/**
 * Find a place by free-text query, e.g. "The High Line, New York City": ID, first photo,
 * coordinates and Google Maps link. `location` and `googleMapsUri` are Essentials fields, so
 * they add nothing to the Pro SKU that `places.photos` already triggers.
 */
export async function findPlace(query: string): Promise<PlaceLookup | null> {
	if (!GOOGLE_MAPS_API_KEY || !query.trim()) return null;
	const key = query.trim().toLowerCase();
	const hit = placeCache.get(key);
	if (hit && Date.now() - hit.at < DAY) return hit.value;
	const ctrl = new AbortController();
	const t = setTimeout(() => ctrl.abort(), 8000);
	let value: PlaceLookup | null = null;
	try {
		const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
				'X-Goog-FieldMask': 'places.id,places.photos,places.location,places.googleMapsUri'
			},
			body: JSON.stringify({ textQuery: query, pageSize: 1 }),
			signal: ctrl.signal
		});
		if (res.ok) {
			const data = (await res.json()) as TextSearchResponse;
			const place = data.places?.[0];
			if (place && /^[A-Za-z0-9_-]+$/.test(place.id)) {
				value = { placeId: place.id };
				const photo = place.photos?.[0];
				if (photo && validPhotoName(photo.name)) {
					const author = photo.authorAttributions?.[0];
					value.photo = {
						name: photo.name,
						placeId: place.id,
						attribution: author?.displayName || 'Google Maps contributor',
						attributionUrl: author?.uri && /^https:\/\//.test(author.uri) ? author.uri : undefined
					};
				}
				const lat = place.location?.latitude;
				const lng = place.location?.longitude;
				if (
					typeof lat === 'number' &&
					typeof lng === 'number' &&
					Math.abs(lat) <= 90 &&
					Math.abs(lng) <= 180
				)
					value.coords = { lat, lng };
				if (
					place.googleMapsUri &&
					/^https:\/\/(www\.google\.com\/maps|maps\.google\.com\/)/.test(place.googleMapsUri)
				)
					value.mapsUrl = place.googleMapsUri;
			}
		}
	} catch {
		value = null;
	} finally {
		clearTimeout(t);
	}
	placeCache.set(key, { at: Date.now(), value });
	return value;
}

/** Back-compat: just the first photo of a place. */
export async function findPlacePhoto(query: string): Promise<ExperiencePhoto | null> {
	return (await findPlace(query))?.photo ?? null;
}

/** Resolve a photo resource name to a Google-hosted image URL (lh3.googleusercontent.com). */
export async function photoUri(name: string, maxWidthPx = 900): Promise<string | null> {
	if (!validPhotoName(name)) return null;
	const key = `${name}@${maxWidthPx}`;
	const hit = uriCache.get(key);
	if (hit && Date.now() - hit.at < DAY) return hit.value;
	const data = await get<{ photoUri?: string }>(
		`https://places.googleapis.com/v1/${name}/media?maxWidthPx=${maxWidthPx}&skipHttpRedirect=true&key=${GOOGLE_MAPS_API_KEY}`
	);
	const uri = data?.photoUri;
	if (!uri || !/^https:\/\/[a-z0-9.-]+\.googleusercontent\.com\//.test(uri)) return null;
	uriCache.set(key, { at: Date.now(), value: uri });
	return uri;
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
	if (!GOOGLE_MAPS_API_KEY || !/^[A-Za-z0-9_-]+$/.test(placeId)) return null;
	const hit = reviewCache.get(placeId);
	if (hit && Date.now() - hit.at < DAY) return hit.value;
	const data = await get<DetailsResponse>(
		`https://places.googleapis.com/v1/places/${placeId}`,
		8000,
		{ 'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY, 'X-Goog-FieldMask': 'rating,userRatingCount,reviews' }
	);
	const value: PlaceReviews | null = data
		? {
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
			}
		: null;
	reviewCache.set(placeId, { at: Date.now(), value });
	return value;
}

/** Reviews via Nimble's Google Maps Web API when Places is not configured. */
async function nimbleFallbackReviews(query: string): Promise<PlaceReviews | null> {
	if (!nimbleMapsEnabled()) return null;
	const { reviews } = await mapsReviews(query);
	return reviews.length ? { reviews: reviews.slice(0, 5) } : null;
}

type Enrichable = {
	photo?: ExperiencePhoto;
	coords?: LatLng;
	mapsUrl?: string;
	placeQuery?: string;
	location: string;
	title: string;
	reviews?: PlaceReview[];
	rating?: number;
	reviewCount?: number;
	reviewSource?: 'google-places' | 'nimble';
};

/**
 * Attach photo, coordinates, Maps link, rating and reviews to each experience.
 * Places first, Nimble reviews as fallback. Never throws; items pass through untouched on failure.
 */
export async function enrichPlaces<T extends Enrichable>(items: T[]): Promise<T[]> {
	if (!placesEnabled() && !nimbleMapsEnabled()) return items;
	return Promise.all(
		items.map(async (item) => {
			const query = item.placeQuery || `${item.title} ${item.location}`;
			let out: T = item;
			if (placesEnabled()) {
				const place = await findPlace(query);
				if (place) {
					out = {
						...out,
						photo: out.photo ?? place.photo,
						coords: out.coords ?? place.coords,
						mapsUrl: out.mapsUrl ?? place.mapsUrl
					};
					if (!item.reviews) {
						const r = await placeReviews(place.placeId);
						if (r)
							out = {
								...out,
								rating: r.rating,
								reviewCount: r.reviewCount,
								reviews: r.reviews,
								reviewSource: 'google-places'
							};
					}
				}
			}
			if (!out.reviews?.length) {
				const r = await nimbleFallbackReviews(query);
				if (r) out = { ...out, reviews: r.reviews, reviewSource: 'nimble' };
			}
			return out;
		})
	);
}
