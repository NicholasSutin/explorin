/**
 * Seed one person's real reflections as evidence: npm run db:seed-persona -- data/personas/nick.json
 * The persona file has the same shape onboarding collects (blurb, interests, audience, tier-list grades), so the
 * author vector is the embedding of `tasteSummary`, exactly what real members get: seeded quotes then sit in the
 * same space as the askers they are matched to. Inserts reflections with source='user'; adds a place first when
 * `new_place` is given.
 */
import { readFileSync } from 'node:fs';
import { sql, embedDoc, vec } from './_shared';
import {
	AUDIENCES,
	CATEGORY,
	GRADE_WEIGHT,
	GRADES,
	INTERESTS,
	tasteSummary
} from '../src/lib/taste';
import type { Grades } from '../src/lib/taste';

interface Persona {
	name: string;
	blurb: string;
	interests: string[];
	audience?: string[];
	grades: Grades;
	reflections?: {
		place: string;
		text: string;
		quote?: string;
		emotions?: string[];
		themes?: string[];
		new_place?: { kind: string; lat: number; lng: number; tags: string[]; notes: string } | null;
	}[];
}

const file = process.argv[2];
if (!file) {
	console.error('usage: seed-persona.ts <persona.json>');
	process.exit(1);
}
const p = JSON.parse(readFileSync(file, 'utf8')) as Persona;
const unknown = [
	...p.interests.filter((i) => !(INTERESTS as readonly string[]).includes(i)),
	...(p.audience ?? []).filter((a) => !(AUDIENCES as readonly string[]).includes(a)),
	...Object.entries(p.grades)
		.filter(([id, g]) => !CATEGORY.has(id) || !(GRADES as readonly string[]).includes(g ?? ''))
		.map(([id, g]) => `${id}: ${g}`)
];
if (unknown.length) {
	console.error(`unknown values in ${file}: ${unknown.join(', ')} (see src/lib/taste.ts)`);
	process.exit(1);
}

const summary = tasteSummary({ ...p, audience: p.audience ?? [] });
const authorVec = await embedDoc(summary);
// Same label as a member's shared quote: first name plus their strongest love (keepsake.ts displayName).
const top = Object.entries(p.grades).sort(([, a], [, b]) => GRADE_WEIGHT[b!] - GRADE_WEIGHT[a!])[0];
const love =
	top && GRADE_WEIGHT[top[1]!] >= 4 ? CATEGORY.get(top[0])?.name.toLowerCase() : undefined;
const first = p.name.trim().split(/\s+/)[0];
const display = love ? `${first} · loves ${love}` : first;

let n = 0;
for (const r of p.reflections ?? []) {
	let [place] = await sql<{ id: string }[]>`SELECT id FROM places WHERE name = ${r.place}`;
	if (!place && r.new_place) {
		[place] = await sql<
			{ id: string }[]
		>`INSERT INTO places (name, kind, lat, lng, tags, notes, maps_url)
			VALUES (${r.place}, ${r.new_place.kind}, ${r.new_place.lat}, ${r.new_place.lng}, ${r.new_place.tags}, ${r.new_place.notes},
			        ${`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.place + ' New York')}`}) RETURNING id`;
		console.log(`added place ${r.place}`);
	}
	if (!place) {
		console.warn(`skip: unknown place "${r.place}" (add new_place to create it)`);
		continue;
	}
	const quote = r.quote ?? r.text;
	const dup =
		await sql`SELECT 1 FROM reflections WHERE place_id = ${place.id} AND quote = ${quote}`;
	if (dup.length) continue;
	const emb = await embedDoc(r.text);
	await sql`INSERT INTO reflections (place_id, source, display_name, body, quote, emotions, themes, consent_share, embedding, author_profile_embedding)
	          VALUES (${place.id}, 'user', ${display}, ${r.text}, ${quote}, ${r.emotions ?? []}, ${r.themes ?? []}, true, ${vec(emb)}::vector, ${vec(authorVec)}::vector)`;
	n++;
}
console.log(`seeded ${n} reflections for ${p.name} (${display})`);
await sql.end();
