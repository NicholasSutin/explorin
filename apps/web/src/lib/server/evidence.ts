/**
 * "People like you" in the planner: first-person quotes from the reflections table, matched to the stops a
 * plan produced and ranked by how close they are to the asker's prompt and to the asker's taste embedding
 * (two-axis retrieval scoped to a known list of places, ADR-0005). Needs DATABASE_URL and a Gemini key;
 * otherwise the step reports itself skipped and the plan goes on.
 *
 * A quote matches a stop by Google place id: the one stored with the quote, else its places row's. The fuzzy
 * name match is the fallback for when either side has no id, so two branches of a chain stay apart.
 */
import { DATABASE_URL, GEMINI_API_KEY } from '$app/env/private';
import type { Experience, PlaceVoice } from '#lib/adventure';

export const evidenceEnabled = () => Boolean(DATABASE_URL && GEMINI_API_KEY);

interface VoiceRow extends PlaceVoice {
	place: string;
	gid: string | null;
}

const norm = (s: string) =>
	s
		.toLowerCase()
		.replace(/[^a-z0-9 ]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
const sameName = (a: string, b: string) =>
	Boolean(a && b) && (a === b || a.includes(b) || b.includes(a));

/** Attach up to two matching quotes per experience. Never throws; returns the input untouched on failure. */
export async function attachVoices<T extends Pick<Experience, 'place' | 'placeId' | 'voices'>>(
	prompt: string,
	experiences: T[],
	uid?: string
): Promise<{ experiences: T[]; voices: number; profile: boolean }> {
	if (!evidenceEnabled() || !experiences.length) return { experiences, voices: 0, profile: false };
	// Loaded lazily so the planner does not pull Postgres in when no database is configured.
	const [{ sql, vec, getTasteEmbedding }, { embed }] = await Promise.all([
		import('./db'),
		import('./gemini')
	]);
	const ids = [...new Set(experiences.flatMap((e) => (e.placeId ? [e.placeId] : [])))];
	const namesOf = (list: T[]) => [...new Set(list.map((e) => norm(e.place)).filter(Boolean))];
	// Stops without an id match any quote by name; stops with one only quotes that have no id either.
	const free = namesOf(experiences.filter((e) => !e.placeId));
	const pinned = namesOf(experiences.filter((e) => e.placeId));
	const [promptVec, taste] = await Promise.all([
		embed(prompt, 'query', 'plan.people'),
		uid ? getTasteEmbedding(uid) : null
	]);
	const profileVec = taste ? vec(taste) : null;
	const rows = await sql<VoiceRow[]>`
		SELECT r.id, r.quote, r.display_name AS who, r.source, r.emotions, p.name AS place, k.gid,
		       0.6 * (1 - (r.embedding <=> ${vec(promptVec)}::vector))
		     + 0.4 * COALESCE(1 - (r.author_profile_embedding <=> ${profileVec}::vector), 0.5)
		     + CASE WHEN r.source = 'user' THEN 0.05 ELSE 0 END AS score
		FROM reflections r JOIN places p ON p.id = r.place_id,
		  LATERAL (SELECT COALESCE(r.google_place_id, p.google_place_id) AS gid,
		                  btrim(regexp_replace(lower(regexp_replace(p.name, '[^A-Za-z0-9 ]', ' ', 'g')), ' +', ' ', 'g')) AS name) k
		WHERE r.consent_share AND r.quote IS NOT NULL AND r.embedding IS NOT NULL
		  AND (k.gid = ANY(${ids}::text[])
		    OR (k.name <> '' AND EXISTS (
		      SELECT 1
		      FROM unnest(${free}::text[] || CASE WHEN k.gid IS NULL THEN ${pinned}::text[] ELSE '{}'::text[] END) AS n
		      WHERE k.name LIKE '%' || n || '%' OR n LIKE '%' || k.name || '%')))
		ORDER BY score DESC
		LIMIT 40`;
	let total = 0;
	const out = experiences.map((e) => {
		const key = norm(e.place);
		const voices = rows
			.filter((r) => (e.placeId && r.gid ? r.gid === e.placeId : sameName(key, norm(r.place))))
			.slice(0, 2)
			.map(({ id, quote, who, source, emotions }) => ({
				id,
				quote,
				who,
				source,
				emotions: emotions ?? []
			}));
		total += voices.length;
		return voices.length ? { ...e, voices } : e;
	});
	return { experiences: out, voices: total, profile: Boolean(profileVec) };
}
