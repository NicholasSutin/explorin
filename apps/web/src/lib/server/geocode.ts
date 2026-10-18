/**
 * Turn NYC event-location text into coordinates for the trip map. Two sources, cheapest first:
 *  - NYC Planning Labs GeoSearch (free, no key): parks, plazas, venues and addresses.
 *  - Google Geocoding API ($5 / 1k after 10k free per month) for street segments such as
 *    "CARROLL STREET between SMITH STREET and COURT STREET", which GeoSearch cannot place. Needs the
 *    Geocoding API enabled on GOOGLE_MAPS_API_KEY; without it those events are simply left off the map.
 * Results (including misses) are shared across people in `geocode_cache` for 30 days, which is also the
 * longest Google allows geocoded coordinates to be kept.
 */
import { GOOGLE_MAPS_API_KEY } from '$app/env/private';
import { fetchJson } from './http';
import { sql } from './db';
import { trackCall } from './usage';
import type { LatLng } from '#lib/adventure';

export interface GeoQuery {
	/** Cache key and what gets sent upstream. */
	text: string;
	/** Street segments need an intersection geocoder; everything else goes to GeoSearch first. */
	kind: 'place' | 'intersection';
}

let googleGeocodingOff = false;

async function geosearch(text: string): Promise<LatLng | null> {
	const data = await fetchJson<{
		features?: {
			geometry?: { coordinates?: [number, number] };
			properties?: { confidence?: number };
		}[];
	}>(
		`https://geosearch.planninglabs.nyc/v2/search?size=1&text=${encodeURIComponent(text)}`,
		{},
		4000
	);
	const f = data?.features?.[0];
	const c = f?.geometry?.coordinates;
	if (!c || (f?.properties?.confidence ?? 0) < 0.6) return null;
	return { lat: c[1], lng: c[0] };
}

async function google(text: string): Promise<LatLng | null> {
	if (!GOOGLE_MAPS_API_KEY || googleGeocodingOff) return null;
	trackCall('geocoding.google', 'happening.geocode');
	const data = await fetchJson<{
		status?: string;
		results?: { geometry?: { location?: { lat: number; lng: number } } }[];
	}>(
		`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(text)}&key=${GOOGLE_MAPS_API_KEY}`,
		{},
		4000
	);
	if (data?.status === 'REQUEST_DENIED') {
		if (googleGeocodingOff) return null; // a parallel lookup already reported it
		googleGeocodingOff = true; // not enabled on this key; stop asking until the process restarts
		console.warn(
			'[geocode] Geocoding API is not enabled on GOOGLE_MAPS_API_KEY; street-segment events skipped'
		);
		return null;
	}
	return data?.results?.[0]?.geometry?.location ?? null;
}

/**
 * Coordinates for each query (null when it could not be placed), resolving at most `budget` uncached
 * queries within `timeoutMs` so a slow geocoder never holds up a plan. Misses are cached too.
 */
export async function geocodeAll(
	queries: GeoQuery[],
	{ budget = 30, timeoutMs = 5000 }: { budget?: number; timeoutMs?: number } = {}
): Promise<Map<string, LatLng | null>> {
	const out = new Map<string, LatLng | null>();
	const keys = [...new Set(queries.map((q) => q.text))];
	if (!keys.length) return out;
	const cached = await sql<{ query: string; lat: number | null; lng: number | null }[]>`
		SELECT query, lat, lng FROM geocode_cache
		WHERE query = ANY(${keys}) AND fetched_at > now() - interval '30 days'`.catch(() => []);
	for (const row of cached)
		out.set(row.query, row.lat != null && row.lng != null ? { lat: row.lat, lng: row.lng } : null);

	const todo = queries.filter((q) => !out.has(q.text)).slice(0, budget);
	const fresh: { query: string; lat: number | null; lng: number | null; source: string }[] = [];
	const deadline = Date.now() + timeoutMs;
	let next = 0;
	async function worker() {
		while (next < todo.length && Date.now() < deadline) {
			const q = todo[next++];
			let hit: LatLng | null = null;
			let source = 'none';
			if (q.kind === 'place') {
				hit = await geosearch(q.text);
				if (hit) source = 'geosearch';
			}
			if (!hit) {
				hit = await google(q.text);
				if (hit) source = 'google';
			}
			out.set(q.text, hit);
			// A miss caused by Google being off is not remembered, so enabling the API later takes effect.
			if (hit || q.kind === 'place' || !googleGeocodingOff)
				fresh.push({ query: q.text, lat: hit?.lat ?? null, lng: hit?.lng ?? null, source });
		}
	}
	await Promise.all(Array.from({ length: 6 }, worker));
	if (fresh.length)
		await sql`
			INSERT INTO geocode_cache ${sql(fresh)}
			ON CONFLICT (query) DO UPDATE SET lat = EXCLUDED.lat, lng = EXCLUDED.lng,
			  source = EXCLUDED.source, fetched_at = now()`.catch((e) =>
			console.warn('[geocode] cache write failed', (e as Error).message)
		);
	return out;
}
