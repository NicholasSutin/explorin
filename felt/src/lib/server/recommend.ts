import { DEMO_CACHE, LONGTAIL } from '$app/env/private';
import { embed, generateJson, groundedPlaces, type GroundedPlace } from './gemini';
import {
	COMPOSE_SCHEMA,
	COMPOSE_SYSTEM,
	INTENT_SCHEMA,
	INTENT_SYSTEM,
	PLACE_NAMES_SCHEMA
} from './prompts';
import { getProfile, getProfileEmbedding, sql, upsertGroundedPlace, vec } from './db';
import { mapsPlace, nimbleEnabled, nimbleSdkEnabled, webSearch, type LivePlace } from './nimble';
import { validateCards, type ComposedCard } from './validate';
import type { Card, Intent, Quote, RecommendResponse, Source } from '#lib/types';

// Midtown Manhattan default when the browser gives no location.
const NYC = { lat: 40.7484, lng: -73.9857 };

interface EvidenceRow {
	id: string;
	quote: string;
	display_name: string;
	source: Source;
	emotions: string[];
	place_id: string;
	name: string;
	score: number;
}
interface CandidateRow {
	id: string;
	google_place_id?: string | null;
	name: string;
	tags: string[];
	notes: string | null;
	maps_url: string | null;
}

const withTimeout = <T>(p: Promise<T>, ms: number, fallback: T): Promise<T> =>
	Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), ms))]).catch(() => fallback);

export const DEMO_PROMPT = 'a run with views of the water and the Empire State Building';

export async function recommend(
	uid: string,
	prompt: string,
	lat?: number,
	lng?: number
): Promise<RecommendResponse> {
	const profile = await getProfile(uid);
	if (!profile) throw Object.assign(new Error('No profile yet'), { status: 400 });
	const profileVec = (await getProfileEmbedding(uid))!;
	const loc = { lat: lat ?? NYC.lat, lng: lng ?? NYC.lng };

	// 1-2. Intent and intent embedding in parallel. Maps grounding (20-30s) runs in the background and enriches
	//      the places table with real Google place IDs / Maps links for the next request; it never blocks.
	const t0 = Date.now();
	const lap = (label: string) =>
		console.log(`[recommend] ${label} ${((Date.now() - t0) / 1000).toFixed(1)}s`);
	const [intent, intentVec] = await Promise.all([
		generateJson<Intent>(`Request: "${prompt}"`, INTENT_SCHEMA, INTENT_SYSTEM),
		embed(prompt, 'query')
	]);
	lap('intent+embed');
	void enrichWithMaps(prompt, loc);
	const grounded: GroundedPlace[] = [];

	// 4. Evidence retrieval (two-axis: what + who)
	let evidence = await retrieve(intentVec, profileVec);
	lap(`retrieval (${evidence.length} rows)`);

	// Long-tail fallback: thin evidence -> Nimble web search -> Gemini names -> Maps grounding confirms
	let extraGrounded: typeof grounded = [];
	if (LONGTAIL && evidence.filter((e) => e.score > 0.45).length < 3 && nimbleEnabled()) {
		const results = await withTimeout(webSearch(intent.search_query + ' New York City'), 6000, []);
		if (results.length) {
			const { names } = await generateJson<{ names: string[] }>(
				`Extract up to 6 specific real place names in NYC from these search results:\n` +
					results.map((r) => `- ${r.title}: ${r.snippet}`).join('\n'),
				PLACE_NAMES_SCHEMA
			);
			if (names.length) {
				extraGrounded = await withTimeout(
					groundedPlaces(
						`Confirm these are real places in New York City and return each: ${names.join('; ')}`,
						loc.lat,
						loc.lng
					),
					8000,
					[]
				);
			}
		}
	}

	// 5. Candidates = curated seed places (tags are honest, so the composer knows e.g. which have esb_view)
	//    UNION places from evidence UNION Maps-grounded places (upserted)
	const groundedRows = await Promise.all(
		[...grounded, ...extraGrounded].map((g) => upsertGroundedPlace(g))
	);
	const curated = await sql<CandidateRow[]>`
		SELECT id, google_place_id, name, tags, notes, maps_url FROM places WHERE kind IS NOT NULL ORDER BY name`;
	const evidencePlaceIds = [...new Set(evidence.map((e) => e.place_id))];
	const evidencePlaces = evidencePlaceIds.length
		? await sql<
				CandidateRow[]
			>`SELECT id, google_place_id, name, tags, notes, maps_url FROM places WHERE id IN ${sql(evidencePlaceIds)}`
		: [];
	const candidates = new Map<string, CandidateRow>();
	for (const p of [...evidencePlaces, ...curated]) candidates.set(p.id, p);
	for (const p of groundedRows)
		if (!candidates.has(p.id))
			candidates.set(p.id, {
				id: p.id,
				name: p.name,
				tags: p.tags ?? [],
				notes: p.notes,
				maps_url: p.maps_url
			});

	// 6. Live context: served from places.live (cached), refreshed in the background when older than 30 min.
	//    Never blocks the response.
	const top = [...new Set([...evidencePlaceIds, ...candidates.keys()])]
		.slice(0, 5)
		.map((id) => candidates.get(id)!)
		.filter(Boolean);
	const live: Record<string, unknown> = {};
	if (top.length) {
		const rows = await sql<{ id: string; live: unknown; live_at: string | null }[]>`
			SELECT id, live, live_at FROM places WHERE id IN ${sql([...candidates.keys()])}`;
		for (const r of rows) if (r.live) live[r.id] = r.live;
		if (nimbleSdkEnabled()) {
			const topIds = new Set(top.map((p) => p.id));
			const stale = rows.filter(
				(r) =>
					topIds.has(r.id) &&
					(!r.live_at || Date.now() - new Date(r.live_at).getTime() > 30 * 60 * 1000)
			);
			for (const r of stale) {
				const name = candidates.get(r.id)!.name;
				void mapsPlace(`${name} New York`, 15000)
					.then(async (l) => {
						if (l)
							await sql`UPDATE places SET live = ${sql.json(l as never)}, live_at = now(),
								google_place_id = COALESCE(google_place_id, ${l.google_place_id ?? null}),
								maps_url = CASE WHEN google_place_id IS NULL AND ${l.maps_url ?? null}::text IS NOT NULL THEN ${l.maps_url ?? null} ELSE maps_url END
								WHERE id = ${r.id}`;
					})
					.catch(() => {});
			}
		}
	}
	lap(`live (${Object.keys(live).length} cached)`);

	// 7. Compose (IDs only)
	const composed = await generateJson<{ feasibility_note: string | null; cards: ComposedCard[] }>(
		[
			`USER PROFILE: ${JSON.stringify({ name: profile.name, ...profile.traits })}`,
			`INTENT: ${JSON.stringify(intent)}`,
			`CANDIDATES: ${JSON.stringify([...candidates.values()].map((c) => ({ place_id: c.id, name: c.name, tags: c.tags, notes: c.notes })))}`,
			`EVIDENCE: ${JSON.stringify(evidence.slice(0, 8).map((e) => ({ quote_id: e.id, place_id: e.place_id, quote: e.quote, display_name: e.display_name, emotions: e.emotions, source: e.source })))}`,
			`LIVE: ${JSON.stringify(live)}`,
			`NOW: ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })}`
		].join('\n\n'),
		COMPOSE_SCHEMA,
		COMPOSE_SYSTEM
	);

	lap('compose');

	// 8. Validate
	const valid = validateCards(
		composed.cards ?? [],
		new Set(candidates.keys()),
		new Set(evidence.map((e) => e.id))
	);

	// 9 + 10. Hydrate and insert experiences
	const byQuote = new Map(evidence.map((e) => [e.id, e]));
	const cards: Card[] = [];
	for (const c of valid) {
		const place = candidates.get(c.place_id)!;
		const [exp] = await sql<{ id: string }[]>`
			INSERT INTO experiences (user_id, place_id, prompt, status) VALUES (${uid}, ${c.place_id}, ${prompt}, 'recommended') RETURNING id`;
		const quotes: Quote[] = c.quote_ids
			.map((q) => byQuote.get(q)!)
			.map((e) => ({
				id: e.id,
				quote: e.quote,
				display_name: e.display_name,
				source: e.source,
				emotions: e.emotions ?? []
			}));
		cards.push({
			experience_id: exp.id,
			place_id: c.place_id,
			place_name: place.name,
			google_place_id: place.google_place_id ?? null,
			maps_url:
				place.maps_url ??
				`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name + ' New York')}`,
			title: c.title,
			plan: c.plan,
			why_for_you: c.why_for_you,
			quotes,
			right_now: formatRightNow(live[c.place_id] as LivePlace | undefined) ?? c.right_now ?? null
		});
	}

	lap('done');
	return {
		feasibility_note: composed.feasibility_note ?? intent.feasibility_note ?? null,
		cards,
		attribution: cards.some((c) => c.google_place_id) ? 'google_maps' : null
	};
}

/** Background: ground the request with Google Maps, upsert new places, and attach place IDs to curated places by name. */
async function enrichWithMaps(prompt: string, loc: { lat: number; lng: number }) {
	try {
		const grounded = await withTimeout(
			groundedPlaces(
				`List up to 5 real places in New York City that match this request: "${prompt}". Prefer parks, waterfront paths, and viewpoints.`,
				loc.lat,
				loc.lng
			),
			40000,
			[]
		);
		for (const g of grounded) {
			const norm = g.title.toLowerCase().replace(/[^a-z0-9 ]/g, '');
			const match = await sql<{ id: string; google_place_id: string | null }[]>`
				SELECT id, google_place_id FROM places WHERE kind IS NOT NULL
				  AND (lower(name) = ${g.title.toLowerCase()} OR ${norm} LIKE '%' || lower(regexp_replace(name, '[^A-Za-z0-9 ]', '', 'g')) || '%'
				       OR lower(regexp_replace(name, '[^A-Za-z0-9 ]', '', 'g')) LIKE '%' || ${norm} || '%') LIMIT 1`;
			if (match[0]) {
				if (!match[0].google_place_id)
					await sql`UPDATE places SET google_place_id = ${g.placeId}, maps_url = ${g.uri} WHERE id = ${match[0].id}`;
			} else {
				await upsertGroundedPlace(g);
			}
		}
		console.log(`[recommend] maps enrichment: ${grounded.length} grounded`);
	} catch (e) {
		console.warn('[recommend] maps enrichment failed', (e as Error).message);
	}
}

function formatRightNow(l?: LivePlace): string | null {
	if (!l) return null;
	const parts: string[] = [];
	if (l.status === 'OPERATIONAL') parts.push('Open');
	else if (l.status) parts.push(l.status.toLowerCase().replace(/_/g, ' '));
	if (l.rating)
		parts.push(
			`${l.rating.toFixed(1)}★${l.reviews ? ` from ${l.reviews >= 1000 ? `${(l.reviews / 1000).toFixed(l.reviews >= 10000 ? 0 : 1)}k` : l.reviews} Google reviews` : ''}`
		);
	if (l.description) parts.push(l.description);
	return parts.length ? parts.join(' · ') : null;
}

async function retrieve(intentVec: number[], profileVec: number[]): Promise<EvidenceRow[]> {
	return sql<EvidenceRow[]>`
		SELECT r.id, r.quote, r.display_name, r.source, r.emotions,
		       p.id AS place_id, p.name,
		       0.6 * (1 - (r.embedding <=> ${vec(intentVec)}::vector))
		     + 0.4 * COALESCE(1 - (r.author_profile_embedding <=> ${vec(profileVec)}::vector), 0.5)
		     + CASE WHEN r.source = 'user' THEN 0.05 ELSE 0 END AS score
		FROM reflections r JOIN places p ON p.id = r.place_id
		WHERE r.consent_share AND r.quote IS NOT NULL AND r.embedding IS NOT NULL
		ORDER BY score DESC
		LIMIT 12`;
}

/** Cached wrapper for the scripted demo prompt (persisted in Postgres so dev reloads keep it); everything else runs live. */
export async function recommendCached(uid: string, prompt: string, lat?: number, lng?: number) {
	const key = `${uid}:${prompt.trim().toLowerCase()}`;
	const isDemo = DEMO_CACHE && prompt.trim().toLowerCase() === DEMO_PROMPT.toLowerCase();
	if (isDemo) {
		const [hit] = await sql<{ value: RecommendResponse }[]>`
			SELECT value FROM response_cache WHERE key = ${key} AND created_at > now() - interval '2 hours'`;
		if (hit) {
			console.log('[recommend] demo cache hit');
			return hit.value;
		}
	}
	const value = await recommend(uid, prompt, lat, lng);
	if (isDemo)
		await sql`INSERT INTO response_cache (key, value) VALUES (${key}, ${sql.json(value as never)})
		          ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, created_at = now()`;
	return value;
}
