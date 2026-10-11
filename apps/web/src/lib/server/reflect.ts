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
	// Ownership first, so nothing is fetched or billed for an experience that is not this user's.
	const [exp] = await sql<{ id: string; place_id: string; user_id: string; name: string }[]>`
		SELECT e.id, e.place_id, e.user_id, p.name FROM experiences e JOIN places p ON p.id = e.place_id
		WHERE e.id = ${experienceId} AND e.user_id = ${uid}`;
	if (!exp) error(404, 'Experience not found');

	// The embedding of the user's own words depends on nothing else, so it runs alongside the lookups.
	const [profile, images, bodyVec] = await Promise.all([
		getProfileWithEmbedding(uid),
		Promise.all(photoUrls.slice(0, 3).map(imagePart)),
		embed(text, 'doc')
	]);

	const parts: Part[] = [
		...images,
		{
			text:
				`Place: ${exp.name}.\nThe person wrote: "${text}"\n` +
				(profile ? `Their profile summary: ${profile.traits.summary}` : '')
		}
	];
	const analysis = await generateJson<ReflectionAnalysis>(parts, REFLECT_SCHEMA, REFLECT_SYSTEM);

	const firstName = profile?.name?.split(' ')[0] ?? 'Someone';
	const topActivity = profile?.traits.activities?.[0]?.name;
	const displayName = topActivity ? `${firstName}, ${topActivity}` : firstName;
	const authorVec = profile?.embedding ?? null;

	// Persist the reflection and close the experience together; only then rewrite the profile,
	// so a failed insert leaves the profile untouched.
	const [row] = await sql.begin(async (tx) => {
		const rows = await tx<{ id: string }[]>`
			INSERT INTO reflections (place_id, experience_id, author_id, source, display_name, body, quote, emotions, themes,
			                         photo_urls, consent_share, embedding, author_profile_embedding)
			VALUES (${exp.place_id}, ${exp.id}, ${uid}, 'user', ${displayName}, ${text}, ${analysis.quote},
			        ${analysis.emotions}, ${analysis.themes}, ${photoUrls}, ${consent},
			        ${vec(bodyVec)}::vector, ${authorVec ? vec(authorVec) : null}::vector)
			RETURNING id`;
		await tx`UPDATE experiences SET status = 'finished', finished_at = COALESCE(finished_at, now()) WHERE id = ${exp.id}`;
		return rows;
	});
	const updated = profile
		? await mergeProfileUpdates(profile, analysis.profile_updates, analysis.learned)
		: null;

	return { reflection_id: row.id, ...analysis, profile: updated };
}
