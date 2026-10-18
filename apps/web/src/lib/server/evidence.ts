/**
 * "People like you" for discovery: first-person quotes from the reflections table, matched to the
 * places a discovery run produced and ranked by how close they are to the asker's prompt (and to
 * the asker's taste profile, when they have one): two-axis retrieval scoped to a known list of places. Needs DATABASE_URL and a Gemini key; otherwise it says so
 * and the pipeline moves on.
 */
import { DATABASE_URL, GEMINI_API_KEY } from '$app/env/private';
import type { Experience, PlaceVoice } from '#lib/adventure';

export const evidenceEnabled = () => Boolean(DATABASE_URL && GEMINI_API_KEY);

interface VoiceRow extends PlaceVoice {
	place: string;
}

const norm = (s: string) =>
	s
		.toLowerCase()
		.replace(/[^a-z0-9 ]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();

/** Attach up to two matching quotes per experience. Never throws; returns the input untouched on failure. */
export async function attachVoices<T extends Pick<Experience, 'place' | 'voices'>>(
	prompt: string,
	experiences: T[],
	uid?: string
): Promise<{ experiences: T[]; voices: number; profile: boolean }> {
	if (!evidenceEnabled() || !experiences.length) return { experiences, voices: 0, profile: false };
	// Loaded lazily so the discovery path does not pull Postgres in when no database is configured.
	const [{ sql, vec, getTasteEmbedding }, { embed }] = await Promise.all([
		import('./db'),
		import('./gemini')
	]);
	const names = [...new Set(experiences.map((e) => norm(e.place)).filter(Boolean))];
	const [promptVec, taste] = await Promise.all([
		embed(prompt, 'query', 'plan.people'),
		uid ? getTasteEmbedding(uid) : null
	]);
	const profileVec = taste ? vec(taste) : null;
	const rows = await sql<VoiceRow[]>`
		SELECT r.id, r.quote, r.display_name AS who, r.source, r.emotions, p.name AS place,
		       0.6 * (1 - (r.embedding <=> ${vec(promptVec)}::vector))
		     + 0.4 * COALESCE(1 - (r.author_profile_embedding <=> ${profileVec}::vector), 0.5)
		     + CASE WHEN r.source = 'user' THEN 0.05 ELSE 0 END AS score
		FROM reflections r JOIN places p ON p.id = r.place_id
		WHERE r.consent_share AND r.quote IS NOT NULL AND r.embedding IS NOT NULL
		  AND EXISTS (
		    SELECT 1 FROM unnest(${names}::text[]) AS n
		    WHERE lower(regexp_replace(p.name, '[^A-Za-z0-9 ]', ' ', 'g')) LIKE '%' || n || '%'
		       OR n LIKE '%' || lower(regexp_replace(p.name, '[^A-Za-z0-9 ]', ' ', 'g')) || '%')
		ORDER BY score DESC
		LIMIT 40`;
	let total = 0;
	const out = experiences.map((e) => {
		const key = norm(e.place);
		const voices = rows
			.filter((r) => {
				const p = norm(r.place);
				return p === key || p.includes(key) || key.includes(p);
			})
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
