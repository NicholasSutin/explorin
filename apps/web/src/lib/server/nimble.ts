/**
 * Nimble wrappers. Two jobs: live "right now" place context and long-tail web search.
 * Plus generic page fetch for Yelp / Tripadvisor review pages (parsed by Gemini in ingest).
 *
 * One credential: the SDK API key (Settings > API Keys), sent as Bearer to https://sdk.nimbleway.com
 * (/v2/search, /v2/extract, /v2/extract/templates/run). Every function degrades to null/[] instead of throwing.
 * Verified against live responses on 2026-10-11 with `npm run nimble:smoke`.
 */
import { NIMBLE_API_KEY, NIMBLE_BASE_URL } from '$app/env/private';
import { timedFetch } from './http';
import { trackCall } from './usage';

export const nimbleEnabled = () => Boolean(NIMBLE_API_KEY);

const BEARER = NIMBLE_API_KEY ? `Bearer ${NIMBLE_API_KEY.replace(/^Bearer\s+/i, '')}` : '';

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
	if (!nimbleEnabled()) return null;
	trackCall('nimble.maps_place', 'place.live');
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
	query: string,
	operation = 'search'
): Promise<{ title: string; url: string; snippet: string }[]> {
	if (!nimbleEnabled()) return [];
	trackCall('nimble.search', operation);
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
	if (!nimbleEnabled()) return '';
	trackCall('nimble.extract', 'page.read');
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
