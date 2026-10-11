/**
 * Seed one person's real reflections as evidence: node --env-file=.env --import tsx scripts/seed-persona.ts data/personas/nick.json
 * Inserts reflections with source='user' and author_profile_embedding = embedding of the persona summary, so the
 * two-axis retrieval ("what" + "who felt it") can match them to similar askers. Adds new places if `new_place` is given.
 */
import { readFileSync } from 'node:fs';
import { sql, embedDoc, vec } from './_shared';

const file = process.argv[2];
if (!file) {
	console.error('usage: seed-persona.ts <persona.json>');
	process.exit(1);
}
const p = JSON.parse(readFileSync(file, 'utf8'));
const authorVec = await embedDoc(p.traits.summary);
const topActivity = p.traits.activities?.[0]?.name;
const display = topActivity ? `${p.name}, ${topActivity}` : p.name;
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
console.log(`seeded ${n} reflections for ${p.name}`);
await sql.end();
