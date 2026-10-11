import { embed, generateJson, imagePart, type Part } from './gemini';
import { PROFILE_SCHEMA, PROFILE_SYSTEM } from './prompts';
import { ensureUser, getProfile, upsertProfile } from './db';
import type { Profile, ReflectionAnalysis, Traits } from '#lib/types';

/** Job 1: build a profile from photos + bio, embed the summary, store. */
export async function buildProfile(
	uid: string,
	name: string,
	photoUrls: string[],
	bio?: string
): Promise<Profile> {
	const parts: Part[] = [];
	for (let i = 0; i < photoUrls.length; i++) {
		parts.push({ text: `Photo ${i + 1}:` });
		parts.push(await imagePart(photoUrls[i]));
	}
	parts.push({
		text: `Name: ${name}.${bio ? ` Bio: "${bio}".` : ' No bio provided.'} Build the profile.`
	});

	const traits = await generateJson<Traits>(parts, PROFILE_SCHEMA, PROFILE_SYSTEM);
	traits.activities = (traits.activities ?? []).filter((a) => a.confidence >= 0.35).slice(0, 6);
	const embedding = await embed(traits.summary, 'doc');

	await ensureUser(uid, name);
	await upsertProfile(uid, traits, embedding);
	return (await getProfile(uid))!;
}

const uniq = (xs: string[]) => [...new Set(xs.map((x) => x.trim().toLowerCase()).filter(Boolean))];

/** Job 5 follow-up: merge learned preferences into traits and re-embed. */
export async function mergeProfileUpdates(
	uid: string,
	updates: ReflectionAnalysis['profile_updates'],
	learned: string
): Promise<Profile | null> {
	const current = await getProfile(uid);
	if (!current) return null;
	const t = current.traits;
	const next: Traits = {
		...t,
		scenery: uniq([...t.scenery, ...updates.add_scenery]),
		values: uniq([...t.values, ...updates.add_values]),
		activities: [
			...t.activities,
			...updates.add_activities
				.filter((a) => !t.activities.some((x) => x.name.toLowerCase() === a.toLowerCase()))
				.map((a) => ({ name: a, confidence: 0.7, evidence: 'your own reflection' }))
		],
		summary: learned && !t.summary.includes(learned) ? `${t.summary} ${learned}` : t.summary
	};
	const embedding = await embed(next.summary, 'doc');
	await upsertProfile(uid, next, embedding);
	return getProfile(uid);
}
