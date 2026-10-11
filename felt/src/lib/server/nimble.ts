/**
 * Nimble wrappers. Three jobs: cold-start reviews, live "right now" context, long-tail web search.
 * Plus generic page fetch for Yelp / Tripadvisor review pages (parsed by Gemini in ingest).
 *
 * Nimble has two API surfaces with different credentials:
 *  - SDK API  https://sdk.nimbleway.com      Bearer <API key>   (Settings > API Keys)        -> /v2/search, /v2/extract
 *  - Web API  https://api.webit.live/api/v1  Basic base64(user:secret) (Client credentials) -> google_maps_reviews (legacy, optional)
 * Only the SDK key is needed for the demo. Every function degrades to null/[] instead of throwing.
 * Response field names for the Maps engines are best-effort: confirm with `npm run nimble:smoke`.
 */
import {
	NIMBLE_API_KEY,
	NIMBLE_BASE_URL,
	NIMBLE_USERNAME,
	NIMBLE_SECRET,
	NIMBLE_WEBAPI_URL
} from '$app/env/private';

export const nimbleSdkEnabled = () => Boolean(NIMBLE_API_KEY);
export const nimbleMapsEnabled = () => Boolean(NIMBLE_USERNAME && NIMBLE_SECRET);
export const nimbleEnabled = () => nimbleSdkEnabled() || nimbleMapsEnabled();

async function post(
	url: string,
	auth: string,
	body: Record<string, unknown>,
	timeoutMs: number
): Promise<any> {
	const ctrl = new AbortController();
	const t = setTimeout(() => ctrl.abort(), timeoutMs);
	try {
		const res = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Authorization: auth },
			body: JSON.stringify(body),
			signal: ctrl.signal
		});
		if (!res.ok)
			throw new Error(
				`Nimble ${new URL(url).pathname} ${res.status}: ${(await res.text()).slice(0, 300)}`
			);
		return res.json();
	} finally {
		clearTimeout(t);
	}
}

const sdk = (path: string, body: Record<string, unknown>, timeoutMs = 20000) => {
	if (!NIMBLE_API_KEY) throw new Error('NIMBLE_API_KEY not set');
	return post(
		`${NIMBLE_BASE_URL}${path}`,
		`Bearer ${NIMBLE_API_KEY.replace(/^Bearer\s+/i, '')}`,
		body,
		timeoutMs
	);
};

const maps = (search_engine: string, params: Record<string, unknown>, timeoutMs = 15000) => {
	if (!NIMBLE_USERNAME || !NIMBLE_SECRET)
		throw new Error('NIMBLE_USERNAME / NIMBLE_SECRET not set');
	const basic = `Basic ${Buffer.from(`${NIMBLE_USERNAME}:${NIMBLE_SECRET}`).toString('base64')}`;
	return post(
		`${NIMBLE_WEBAPI_URL}/realtime/serp`,
		basic,
		{ search_engine, country: 'US', locale: 'en', parse: true, ...params },
		timeoutMs
	);
};

const entities = (data: any) => data?.parsing?.entities ?? data?.parsing ?? {};

export interface Review {
	text: string;
	rating: number | null;
}

/** Google Maps reviews for a place query (Web API). Empty on failure or when not configured. */
export async function mapsReviews(query: string): Promise<{ place: string; reviews: Review[] }> {
	if (!nimbleMapsEnabled()) return { place: query, reviews: [] };
	try {
		const search = entities(await maps('google_maps_search', { query }));
		const first = (search.SearchResult ?? search.Place ?? search.results ?? [])[0];
		const placeId = first?.place_id ?? first?.placeId;
		if (!placeId) return { place: query, reviews: [] };
		const data = entities(
			await maps('google_maps_reviews', { place_id: placeId, sort: 'relevant' })
		);
		const list: any[] = data.Review ?? data.Reviews ?? data.reviews ?? [];
		return {
			place: first.title ?? first.name ?? query,
			reviews: list
				.map((r) => ({
					text: String(r.text ?? r.review ?? r.snippet ?? ''),
					rating: r.rating != null ? Number(r.rating) : null
				}))
				.filter((r) => r.text.length > 20)
				.slice(0, 20)
		};
	} catch (e) {
		console.warn('mapsReviews failed', (e as Error).message);
		return { place: query, reviews: [] };
	}
}

/** Live place context: rating, hours, busyness. Uses the SDK `google_maps_search` template (Bearer key). Null on any failure. */
export async function mapsPlace(
	query: string,
	timeoutMs = 4000
): Promise<{ hours?: string; busyness?: string; rating?: number } | null> {
	if (!nimbleSdkEnabled()) return null;
	try {
		const data = await sdk(
			'/v2/extract/templates/run',
			{ template: 'google_maps_search', params: { query } },
			timeoutMs
		);
		const ents = data?.data?.parsing?.entities ?? data?.data?.parsing ?? {};
		const p = (ents.SearchResult ?? ents.Place ?? [])[0] ?? {};
		const out: { hours?: string; busyness?: string; rating?: number } = {};
		const hours = p.open_hours ?? p.hours ?? p.opening_hours ?? p.working_hours ?? p.open_state;
		if (hours) out.hours = typeof hours === 'string' ? hours : JSON.stringify(hours).slice(0, 300);
		const busy = p.popular_times ?? p.busyness ?? p.live_busyness;
		if (busy) out.busyness = typeof busy === 'string' ? busy : JSON.stringify(busy).slice(0, 300);
		if (p.rating != null) out.rating = Number(p.rating);
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
