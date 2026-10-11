import { error } from '@sveltejs/kit';
import { embed, generateJson, imagePart, type Part } from './gemini';
import { REFLECT_SCHEMA, REFLECT_SYSTEM } from './prompts';
import { getProfileWithEmbedding, sql, vec } from './db';
import { mergeProfileUpdates } from './profile';
import type { ReflectionAnalysis } from '#lib/types';

export async function analyzeReflection(
	uid: string,
	experienceId: string,
	text: string,
	photoUrls: string[],
	consent: boolean
) {
	// The embedding of the user's own words depends on nothing else, so it runs alongside the lookups.
	const bodyVecP = embed(text, 'doc');
	bodyVecP.catch(() => {}); // awaited below; this only keeps an early 404 from leaving it unhandled
	const [[exp], profile, images] = await Promise.all([
		sql<{ id: string; place_id: string; user_id: string; name: string }[]>`
			SELECT e.id, e.place_id, e.user_id, p.name FROM experiences e JOIN places p ON p.id = e.place_id
			WHERE e.id = ${experienceId} AND e.user_id = ${uid}`,
		getProfileWithEmbedding(uid),
		Promise.all(photoUrls.slice(0, 3).map(imagePart))
	]);
	if (!exp) error(404, 'Experience not found');

	const parts: Part[] = [
		...images,
		{
			text:
				`Place: ${exp.name}.\nThe person wrote: "${text}"\n` +
				(profile ? `Their profile summary: ${profile.traits.summary}` : '')
		}
	];
	const [analysis, bodyVec] = await Promise.all([
		generateJson<ReflectionAnalysis>(parts, REFLECT_SCHEMA, REFLECT_SYSTEM),
		bodyVecP
	]);

	const firstName = profile?.name?.split(' ')[0] ?? 'Someone';
	const topActivity = profile?.traits.activities?.[0]?.name;
	const displayName = topActivity ? `${firstName}, ${topActivity}` : firstName;
	const authorVec = profile?.embedding ?? null;

	const [[row], , updated] = await Promise.all([
		sql<{ id: string }[]>`
			INSERT INTO reflections (place_id, experience_id, author_id, source, display_name, body, quote, emotions, themes,
			                         photo_urls, consent_share, embedding, author_profile_embedding)
			VALUES (${exp.place_id}, ${exp.id}, ${uid}, 'user', ${displayName}, ${text}, ${analysis.quote},
			        ${analysis.emotions}, ${analysis.themes}, ${photoUrls}, ${consent},
			        ${vec(bodyVec)}::vector, ${authorVec ? vec(authorVec) : null}::vector)
			RETURNING id`,
		sql`UPDATE experiences SET status = 'finished', finished_at = COALESCE(finished_at, now()) WHERE id = ${exp.id}`,
		profile ? mergeProfileUpdates(profile, analysis.profile_updates, analysis.learned) : null
	]);

	return { reflection_id: row.id, ...analysis, profile: updated };
}
