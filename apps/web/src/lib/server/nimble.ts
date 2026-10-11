/**
 * Nimble wrappers. Three jobs: cold-start reviews, live "right now" context, long-tail web search.
 * Plus generic page fetch for Yelp / Tripadvisor review pages (parsed by Gemini in ingest).
 *
 * Nimble has two API surfaces with different credentials:
 *  - SDK API  https://sdk.nimbleway.com      Bearer <API key>   (Settings > API Keys)        -> /v2/search, /v2/extract
 *  - Web API  https://api.webit.live/api/v1  Basic base64(user:secret) (Client credentials) -> google_maps_reviews (legacy, optional)
 * Only the SDK key is needed for the demo. Every function degrades to null/[] instead of throwing.
 * Verified against live responses on 2026-10-11 with `npm run nimble:smoke`.
 */
import {
	NIMBLE_API_KEY,
	NIMBLE_BASE_URL,
	NIMBLE_USERNAME,
	NIMBLE_SECRET,
	NIMBLE_WEBAPI_URL
} from '$app/env/private';
import type { PlaceReview } from '#lib/adventure';
import { DAY, timedFetch, ttlCache } from './http';

export const nimbleSdkEnabled = () => Boolean(NIMBLE_API_KEY);
export const nimbleMapsEnabled = () => Boolean(NIMBLE_USERNAME && NIMBLE_SECRET);
export const nimbleEnabled = () => nimbleSdkEnabled() || nimbleMapsEnabled();

const BEARER = NIMBLE_API_KEY ? `Bearer ${NIMBLE_API_KEY.replace(/^Bearer\s+/i, '')}` : '';
const BASIC = nimbleMapsEnabled()
	? `Basic ${Buffer.from(`${NIMBLE_USERNAME}:${NIMBLE_SECRET}`).toString('base64')}`
	: '';

async function post(
	url: string,
	auth: string,
	body: Record<string, unknown>,
	timeoutMs: number
): Promise<any> {
	const res = await timedFetch(
		url,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Authorization: auth },
			body: JSON.stringify(body)
		},
		timeoutMs
	);
	if (!res.ok)
		throw new Error(
			`Nimble ${new URL(url).pathname} ${res.status}: ${(await res.text()).slice(0, 300)}`
		);
	return res.json();
}

const sdk = (path: string, body: Record<string, unknown>, timeoutMs = 20000) => {
	if (!BEARER) throw new Error('NIMBLE_API_KEY not set');
	return post(`${NIMBLE_BASE_URL}${path}`, BEARER, body, timeoutMs);
};

const maps = (search_engine: string, params: Record<string, unknown>, timeoutMs = 15000) => {
	if (!BASIC) throw new Error('NIMBLE_USERNAME / NIMBLE_SECRET not set');
	return post(
		`${NIMBLE_WEBAPI_URL}/realtime/serp`,
		BASIC,
		{ search_engine, country: 'US', locale: 'en', parse: true, ...params },
		timeoutMs
	);
};

const entities = (data: any) => data?.parsing?.entities ?? data?.parsing ?? {};

export type Review = PlaceReview;

const reviewCache = ttlCache<{ place: string; reviews: Review[] }>(DAY);

/** Google Maps reviews for a place query (Web API). Empty on failure or when not configured; results (including "no such place") are cached for a day. */
export async function mapsReviews(query: string): Promise<{ place: string; reviews: Review[] }> {
	if (!nimbleMapsEnabled()) return { place: query, reviews: [] };
	const key = query.trim().toLowerCase();
	const hit = reviewCache.get(key);
	if (hit) return hit;
	try {
		const search = entities(await maps('google_maps_search', { query }));
		const first = (search.SearchResult ?? search.Place ?? search.results ?? [])[0];
		const placeId = first?.place_id ?? first?.placeId;
		if (!placeId) return reviewCache.set(key, { place: query, reviews: [] });
		const data = entities(
			await maps('google_maps_reviews', { place_id: placeId, sort: 'relevant' })
		);
		const list: any[] = data.Review ?? data.Reviews ?? data.reviews ?? [];
		return reviewCache.set(key, {
			place: first.title ?? first.name ?? query,
			reviews: list
				.map((r) => ({
					text: String(r.text ?? r.review ?? r.snippet ?? ''),
					rating: r.rating != null ? Number(r.rating) : null
				}))
				.filter((r) => r.text.length > 20)
				.slice(0, 20)
		});
	} catch (e) {
		console.warn('mapsReviews failed', (e as Error).message);
		return { place: query, reviews: [] }; // not cached: the next request may succeed
	}
}

/**
 * Live place context from the SDK `google_maps_search` template (Bearer key, parse: true).
 * Verified fields (2026-10-11): title, place_id, rating ("4.8 stars"), number_of_reviews, review_summary, business_status,
 * place_url, latitude, longitude, business_category, place_information, highlights. Null on any failure.
 */
export interface LivePlace {
	rating?: number;
	reviews?: number;
	status?: string;
	hours?: string;
	highlights?: string;
	description?: string;
	google_place_id?: string;
	maps_url?: string;
}
export async function mapsPlace(query: string, timeoutMs = 4000): Promise<LivePlace | null> {
	if (!nimbleSdkEnabled()) return null;
	try {
		const data = await sdk(
			'/v2/extract/templates/run',
			{ template: 'google_maps_search', params: { query }, parse: true },
			timeoutMs
		);
		const p = data?.data?.parsing?.entities?.SearchResult?.[0];
		if (!p) return null;
		const out: LivePlace = {};
		const rating = parseFloat(String(p.rating ?? p.review_summary?.overall_rating ?? ''));
		if (!Number.isNaN(rating)) out.rating = rating;
		const n = parseInt(
			String(p.number_of_reviews ?? p.review_summary?.review_count ?? '').replace(/\D/g, ''),
			10
		);
		if (!Number.isNaN(n)) out.reviews = n;
		if (p.business_status) out.status = String(p.business_status);
		const info = p.place_information;
		const hours = info?.hours ?? info?.open_hours ?? info?.opening_hours ?? p.hours ?? p.open_hours;
		if (hours) out.hours = typeof hours === 'string' ? hours : JSON.stringify(hours).slice(0, 300);
		if (Array.isArray(p.highlights) && p.highlights.length)
			out.highlights = p.highlights
				.map((h: any) => (typeof h === 'string' ? h : (h?.display_name ?? h?.description ?? '')))
				.filter(Boolean)
				.slice(0, 5)
				.join(', ');
		if (Array.isArray(p.business_description) && p.business_description.length)
			out.description = String(p.business_description[0]).slice(0, 160);
		if (p.place_id) out.google_place_id = String(p.place_id);
		if (p.place_url) out.maps_url = String(p.place_url);
		return Object.keys(out).length ? out : null;
	} catch {
		return null;
	}
}

/** Web search for long-tail discovery (SDK API /v2/search). */
export async function webSearch(
	query: string
): Promise<{ title: string; url: string; snippet: string }[]> {
	if (!nimbleSdkEnabled()) return [];
	try {
		const data = await sdk('/v2/search', { query, max_results: 8, search_depth: 'lite' }, 10000);
		return ((data?.results ?? []) as any[])
			.map((r) => ({
				title: String(r.title ?? ''),
				url: String(r.url ?? ''),
				snippet: String(r.description ?? r.content ?? '').slice(0, 400)
			}))
			.filter((r) => r.url);
	} catch (e) {
		console.warn('webSearch failed', (e as Error).message);
		return [];
	}
}

/** Fetch a public page (Yelp / Tripadvisor) as markdown via the SDK Extract API. Empty string on failure. */
export async function pageText(url: string): Promise<string> {
	if (!nimbleSdkEnabled()) return '';
	try {
		const data = await sdk(
			'/v2/extract',
			{
				url,
				render: 'auto',
				formats: ['markdown'],
				markdown_backend: 'main_content',
				country: 'US',
				locale: 'en'
			},
			45000
		);
		const md: string = data?.data?.markdown ?? '';
		if (md) return md.slice(0, 60000);
		const html: string = data?.data?.html ?? '';
		return html
			.replace(/<script[\s\S]*?<\/script>/gi, ' ')
			.replace(/<style[\s\S]*?<\/style>/gi, ' ')
			.replace(/<[^>]+>/g, ' ')
			.replace(/\s+/g, ' ')
			.trim()
			.slice(0, 60000);
	} catch (e) {
		console.warn('pageText failed', (e as Error).message);
		return '';
	}
}
