/** Kill-rule fallback: hand-written, clearly labeled seed reflections (source = 'seed'). Honest and short. */
import { sql, embedDoc, vec } from './_shared';

const seeds: Record<string, { quote: string; emotions: string[]; themes: string[] }[]> = {
	'Gantry Plaza State Park': [
		{
			quote:
				'Watching the sun come up behind the Empire State from here made the whole city feel like mine.',
			emotions: ['awe', 'belonging'],
			themes: ['sunrise', 'skyline']
		},
		{
			quote:
				'Quiet enough at 6 AM that you hear the water; the skyline is right there the entire run.',
			emotions: ['calm', 'exhilaration'],
			themes: ['water', 'running']
		}
	],
	'Hunters Point South Park': [
		{
			quote:
				'The Chrysler and Empire State line up across the river and you just stop running to look.',
			emotions: ['awe'],
			themes: ['skyline', 'running']
		}
	],
	'Central Park Reservoir': [
		{
			quote: 'Three laps and my head was finally clear; the water does something to you.',
			emotions: ['calm', 'gratitude'],
			themes: ['water', 'running']
		}
	],
	'Brooklyn Bridge Park': [
		{
			quote: 'Pier 1 at golden hour felt like the postcard version of why I moved here.',
			emotions: ['joy', 'pride'],
			themes: ['skyline', 'sunset']
		}
	],
	'Washington Street, DUMBO': [
		{
			quote:
				'Seeing the Empire State framed in the bridge gave me goosebumps, even with the crowd.',
			emotions: ['awe'],
			themes: ['bridge', 'skyline']
		}
	],
	'Roosevelt Island': [
		{
			quote: 'Water on both sides and almost nobody else; the loop felt like a secret.',
			emotions: ['calm', 'belonging'],
			themes: ['water', 'quiet']
		}
	],
	'Hudson River Greenway': [
		{
			quote: 'Sunset over Jersey with the whole river glowing, I ran slower on purpose.',
			emotions: ['calm', 'gratitude'],
			themes: ['sunset', 'water']
		}
	],
	'Fort Tilden': [
		{
			quote:
				'Ocean in front, the faint skyline behind; it is the closest NYC gets to feeling far away.',
			emotions: ['calm', 'awe'],
			themes: ['ocean', 'quiet']
		}
	],
	'Coney Island Boardwalk': [
		{
			quote:
				'The boardwalk at dawn is empty and the ocean is loud; it felt like being a kid again.',
			emotions: ['nostalgia', 'joy'],
			themes: ['ocean', 'sunrise']
		}
	],
	'The High Line': [
		{
			quote:
				'Walking above the streets with the Empire State peeking between buildings felt like a movie.',
			emotions: ['joy', 'awe'],
			themes: ['skyline', 'walk']
		}
	],
	'Little Island': [
		{
			quote: 'Sat at the top at sunset and felt grateful for a city that builds things like this.',
			emotions: ['gratitude', 'calm'],
			themes: ['sunset', 'water']
		}
	]
};

let n = 0;
for (const [name, list] of Object.entries(seeds)) {
	const [p] = await sql<{ id: string }[]>`SELECT id FROM places WHERE name = ${name}`;
	if (!p) {
		console.warn(`no place: ${name}`);
		continue;
	}
	for (const s of list) {
		const dup =
			await sql`SELECT 1 FROM reflections WHERE place_id = ${p.id} AND quote = ${s.quote}`;
		if (dup.length) continue;
		const emb = await embedDoc(s.quote);
		await sql`INSERT INTO reflections (place_id, source, display_name, body, quote, emotions, themes, consent_share, embedding)
		          VALUES (${p.id}, 'seed', 'Seed note', ${s.quote}, ${s.quote}, ${s.emotions}, ${s.themes}, true, ${vec(emb)}::vector)`;
		n++;
	}
}
console.log(`inserted ${n} seed reflections`);
await sql.end();
