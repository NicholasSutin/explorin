import { embed, generateJson, imagePart, type Part } from './gemini';
import { REFLECT_SCHEMA, REFLECT_SYSTEM } from './prompts';
import { getProfile, getProfileEmbedding, sql, vec } from './db';
import { mergeProfileUpdates } from './profile';
import type { ReflectionAnalysis } from '#lib/types';

export async function analyzeReflection(
	uid: string,
	experienceId: string,
	text: string,
	photoUrls: string[],
	consent: boolean
) {
	const [exp] = await sql<{ id: string; place_id: string; user_id: string; name: string }[]>`
		SELECT e.id, e.place_id, e.user_id, p.name FROM experiences e JOIN places p ON p.id = e.place_id
		WHERE e.id = ${experienceId} AND e.user_id = ${uid}`;
	if (!exp) throw Object.assign(new Error('Experience not found'), { status: 404 });

	const profile = await getProfile(uid);
	const parts: Part[] = [];
	for (const url of photoUrls.slice(0, 3)) parts.push(await imagePart(url));
	parts.push({
		text:
			`Place: ${exp.name}.\nThe person wrote: "${text}"\n` +
			(profile ? `Their profile summary: ${profile.traits.summary}` : '')
	});

	const analysis = await generateJson<ReflectionAnalysis>(parts, REFLECT_SCHEMA, REFLECT_SYSTEM);

	const [bodyVec, authorVec] = await Promise.all([embed(text, 'doc'), getProfileEmbedding(uid)]);
	const firstName = profile?.name?.split(' ')[0] ?? 'Someone';
	const topActivity = profile?.traits.activities?.[0]?.name;
	const displayName = topActivity ? `${firstName}, ${topActivity}` : firstName;

	const [row] = await sql<{ id: string }[]>`
		INSERT INTO reflections (place_id, experience_id, author_id, source, display_name, body, quote, emotions, themes,
		                         photo_urls, consent_share, embedding, author_profile_embedding)
		VALUES (${exp.place_id}, ${exp.id}, ${uid}, 'user', ${displayName}, ${text}, ${analysis.quote},
		        ${analysis.emotions}, ${analysis.themes}, ${photoUrls}, ${consent},
		        ${vec(bodyVec)}::vector, ${authorVec ? vec(authorVec) : null}::vector)
		RETURNING id`;

	await sql`UPDATE experiences SET status = 'finished', finished_at = COALESCE(finished_at, now()) WHERE id = ${exp.id}`;
	const updated = await mergeProfileUpdates(uid, analysis.profile_updates, analysis.learned);

	return { reflection_id: row.id, ...analysis, profile: updated };
}
