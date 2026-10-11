import { DEMO_CACHE } from '$app/env/private';
import { embed, generateJson, groundedPlaces } from './gemini';
import {
	COMPOSE_SCHEMA,
	COMPOSE_SYSTEM,
	INTENT_SCHEMA,
	INTENT_SYSTEM,
	PLACE_NAMES_SCHEMA
} from './prompts';
import { getProfile, getProfileEmbedding, sql, upsertGroundedPlace, vec } from './db';
import { mapsPlace, nimbleEnabled, webSearch } from './nimble';
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
	name: string;
	tags: string[];
	notes: string | null;
	maps_url: string | null;
}

const withTimeout = <T>(p: Promise<T>, ms: number, fallback: T): Promise<T> =>
	Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), ms))]).catch(() => fallback);

export const DEMO_PROMPT = 'a run with views of the water and the Empire State Building';
const demoCache = new Map<string, { at: number; value: RecommendResponse }>();

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

	// 1. Intent
	const intent = await generateJson<Intent>(`Request: "${prompt}"`, INTENT_SCHEMA, INTENT_SYSTEM);

	// 2 + 3. Intent embedding and Maps grounding in parallel
	const groundPrompt =
		`List up to 5 real places in New York City for: ${intent.search_query}.` +
		(intent.must_see.length ? ` Must satisfy: ${intent.must_see.join('; ')}.` : '');
	const [intentVec, grounded] = await Promise.all([
		embed(`${prompt} ${intent.vibe}`, 'query'),
		withTimeout(groundedPlaces(groundPrompt, loc.lat, loc.lng), 8000, [])
	]);

	// 4. Evidence retrieval (two-axis: what + who)
	let evidence = await retrieve(intentVec, profileVec);

	// Long-tail fallback: thin evidence -> Nimble web search -> Gemini names -> Maps grounding confirms
	let extraGrounded: typeof grounded = [];
	if (evidence.filter((e) => e.score > 0.45).length < 3 && nimbleEnabled()) {
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

	// 5. Candidates = evidence places UNION grounded (upserted)
	const groundedRows = await Promise.all(
		[...grounded, ...extraGrounded].map((g) => upsertGroundedPlace(g))
	);
	const evidencePlaceIds = [...new Set(evidence.map((e) => e.place_id))];
	const evidencePlaces = evidencePlaceIds.length
		? await sql<
				CandidateRow[]
			>`SELECT id, name, tags, notes, maps_url FROM places WHERE id IN ${sql(evidencePlaceIds)}`
		: [];
	const candidates = new Map<string, CandidateRow>();
	for (const p of evidencePlaces) candidates.set(p.id, p);
	for (const p of groundedRows)
		if (!candidates.has(p.id))
			candidates.set(p.id, {
				id: p.id,
				name: p.name,
				tags: p.tags ?? [],
				notes: p.notes,
				maps_url: p.maps_url
			});

	// 6. Live context for top 3 candidates (4s, null on failure)
	const top = [...candidates.values()].slice(0, 3);
	const live: Record<string, unknown> = {};
	if (nimbleEnabled()) {
		await Promise.all(
			top.map(async (p) => {
				const l = await mapsPlace(`${p.name} New York`);
				if (l) live[p.id] = l;
			})
		);
	}

	// 7. Compose (IDs only)
	const composed = await generateJson<{ feasibility_note: string | null; cards: ComposedCard[] }>(
		[
			`USER PROFILE: ${JSON.stringify({ name: profile.name, ...profile.traits })}`,
			`INTENT: ${JSON.stringify(intent)}`,
			`CANDIDATES: ${JSON.stringify([...candidates.values()].map((c) => ({ place_id: c.id, name: c.name, tags: c.tags, notes: c.notes })))}`,
			`EVIDENCE: ${JSON.stringify(evidence.map((e) => ({ quote_id: e.id, place_id: e.place_id, quote: e.quote, display_name: e.display_name, emotions: e.emotions, source: e.source })))}`,
			`LIVE: ${JSON.stringify(live)}`,
			`NOW: ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })}`
		].join('\n\n'),
		COMPOSE_SCHEMA,
		COMPOSE_SYSTEM
	);

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
			maps_url:
				place.maps_url ??
				`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name + ' New York')}`,
			title: c.title,
			plan: c.plan,
			why_for_you: c.why_for_you,
			quotes,
			right_now: c.right_now ?? null
		});
	}

	return {
		feasibility_note: composed.feasibility_note ?? intent.feasibility_note ?? null,
		cards,
		attribution: grounded.length || extraGrounded.length ? 'google_maps' : null
	};
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

/** Cached wrapper for the scripted demo prompt; everything else always runs live. */
export async function recommendCached(uid: string, prompt: string, lat?: number, lng?: number) {
	const key = `${uid}:${prompt.trim().toLowerCase()}`;
	const isDemo = DEMO_CACHE && prompt.trim().toLowerCase() === DEMO_PROMPT;
	if (isDemo) {
		const hit = demoCache.get(key);
		if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.value;
	}
	const value = await recommend(uid, prompt, lat, lng);
	if (isDemo) demoCache.set(key, { at: Date.now(), value });
	return value;
}
