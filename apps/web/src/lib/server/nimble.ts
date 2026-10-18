/**
 * Nimble web search, the planner's source of long-tail places (src/lib/server/plan.ts).
 *
 * One credential: the SDK API key (Settings > API Keys), sent as Bearer to https://sdk.nimbleway.com/v2/search.
 * Degrades to [] instead of throwing. Verified against live responses with `npm run nimble:smoke`.
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
