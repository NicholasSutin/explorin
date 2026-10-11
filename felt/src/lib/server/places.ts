/**
 * Google Places API (New) wrapper: one Text Search per place to find its ID and first photo,
 * then one Place Photo media call to turn a photo name into a Google-hosted image URL.
 *
 * Billing (Oct 2026): Text Search with `places.photos` in the field mask is the Pro SKU
 * ($32 / 1k after 5k free per month). Photo media is "Place Details Photos" ($7 / 1k after
 * 1k free per month). Both results are cached in memory so a running server pays once per
 * place, not once per page view. Every function degrades to null instead of throwing.
 */
import { GOOGLE_MAPS_API_KEY } from '$app/env/private';
import type { ExperiencePhoto } from '#lib/adventure';

export const placesEnabled = () => Boolean(GOOGLE_MAPS_API_KEY);

const PHOTO_NAME = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;
export const validPhotoName = (name: string) => PHOTO_NAME.test(name);

const DAY = 24 * 60 * 60 * 1000;
const placeCache = new Map<string, { at: number; value: ExperiencePhoto | null }>();
const uriCache = new Map<string, { at: number; value: string }>();

async function get<T>(url: string, timeoutMs = 8000): Promise<T | null> {
	if (!GOOGLE_MAPS_API_KEY) return null;
	const ctrl = new AbortController();
	const t = setTimeout(() => ctrl.abort(), timeoutMs);
	try {
		const res = await fetch(url, { signal: ctrl.signal });
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
		photos?: { name: string; authorAttributions?: { displayName?: string; uri?: string }[] }[];
	}[];
}

/** Find a place's first photo by free-text query, e.g. "The High Line, New York City". */
export async function findPlacePhoto(query: string): Promise<ExperiencePhoto | null> {
	if (!GOOGLE_MAPS_API_KEY || !query.trim()) return null;
	const key = query.trim().toLowerCase();
	const hit = placeCache.get(key);
	if (hit && Date.now() - hit.at < DAY) return hit.value;
	const ctrl = new AbortController();
	const t = setTimeout(() => ctrl.abort(), 8000);
	let value: ExperiencePhoto | null = null;
	try {
		const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
				'X-Goog-FieldMask': 'places.id,places.photos'
			},
			body: JSON.stringify({ textQuery: query, pageSize: 1 }),
			signal: ctrl.signal
		});
		if (res.ok) {
			const data = (await res.json()) as TextSearchResponse;
			const place = data.places?.[0];
			const photo = place?.photos?.[0];
			if (place && photo && validPhotoName(photo.name)) {
				const author = photo.authorAttributions?.[0];
				value = {
					name: photo.name,
					placeId: place.id,
					attribution: author?.displayName || 'Google Maps contributor',
					attributionUrl: author?.uri && /^https:\/\//.test(author.uri) ? author.uri : undefined
				};
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

/** Attach photos to experiences in parallel; leaves the list untouched when Places is off. */
export async function withPhotos<
	T extends { photo?: ExperiencePhoto; placeQuery?: string; location: string; title: string }
>(items: T[]): Promise<T[]> {
	if (!placesEnabled()) return items;
	return Promise.all(
		items.map(async (item) => {
			if (item.photo) return item;
			const photo = await findPlacePhoto(item.placeQuery || `${item.title} ${item.location}`);
			return photo ? { ...item, photo } : item;
		})
	);
}
