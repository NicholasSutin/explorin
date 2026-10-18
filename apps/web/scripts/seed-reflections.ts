/**
 * Curated seed reflections (source = 'seed', labeled "Explorin field notes" in the UI). Honest, short, feeling-first.
 * The baseline "people like you" set; real public reviews from ingest-reviews.ts and members' trip notes add to it.
 * Idempotent: skips quotes that already exist.
 */
import { sql, embedDoc, vec } from './_shared';

type Seed = { quote: string; emotions: string[]; themes: string[]; who?: string };
const seeds: Record<string, Seed[]> = {
	'Gantry Plaza State Park': [
		{
			quote:
				'Watching the sun come up behind the Empire State from here made the whole city feel like mine.',
			emotions: ['awe', 'belonging'],
			themes: ['sunrise', 'skyline', 'running'],
			who: 'early-morning runner'
		},
		{
			quote:
				'Quiet enough at 6 AM that you hear the water; the skyline is right there the entire run.',
			emotions: ['calm', 'exhilaration'],
			themes: ['water', 'running', 'quiet'],
			who: 'runner'
		},
		{
			quote: 'I sat on the pier after my run and felt grateful for the first time in weeks.',
			emotions: ['gratitude', 'calm'],
			themes: ['water', 'reflection'],
			who: 'runner'
		}
	],
	'Hunters Point South Park': [
		{
			quote:
				'The Chrysler and Empire State line up across the river and you just stop running to look.',
			emotions: ['awe'],
			themes: ['skyline', 'running'],
			who: 'runner'
		},
		{
			quote: 'Flat, open, and the view keeps paying you back every quarter mile.',
			emotions: ['joy', 'exhilaration'],
			themes: ['running', 'skyline'],
			who: 'marathon trainee'
		}
	],
	'Central Park Reservoir': [
		{
			quote: 'Three laps and my head was finally clear; the water does something to you.',
			emotions: ['calm', 'gratitude'],
			themes: ['water', 'running', 'quiet'],
			who: 'runner'
		},
		{
			quote:
				'Running it at dawn with the towers reflected in the reservoir felt like a secret the city kept for me.',
			emotions: ['awe', 'belonging'],
			themes: ['sunrise', 'water', 'skyline'],
			who: 'early riser'
		}
	],
	'Brooklyn Bridge Park': [
		{
			quote: 'Pier 1 at golden hour felt like the postcard version of why I moved here.',
			emotions: ['joy', 'pride'],
			themes: ['skyline', 'sunset', 'home'],
			who: 'new New Yorker'
		},
		{
			quote: 'My kids ran ahead on the piers and I just watched the harbor and breathed.',
			emotions: ['calm', 'gratitude'],
			themes: ['family', 'harbor', 'walk'],
			who: 'parent'
		},
		{
			quote:
				'The skyline across the water at dusk made me proud of this city in a way I did not expect.',
			emotions: ['pride', 'awe'],
			themes: ['skyline', 'sunset'],
			who: 'walker'
		}
	],
	'Washington Street, DUMBO': [
		{
			quote:
				'Seeing the Empire State framed in the bridge gave me goosebumps, even with the crowd.',
			emotions: ['awe'],
			themes: ['bridge', 'skyline'],
			who: 'photographer'
		},
		{
			quote: 'Go at 7 AM: the street is empty, the light is soft, and it feels like it is yours.',
			emotions: ['calm', 'joy'],
			themes: ['sunrise', 'quiet', 'skyline'],
			who: 'early riser'
		}
	],
	'Domino Park': [
		{
			quote:
				'The old sugar factory bones and the river made me feel the whole history of the place.',
			emotions: ['nostalgia', 'awe'],
			themes: ['history', 'water'],
			who: 'walker'
		},
		{
			quote: 'Perfect after-work walk; the skyline goes gold and everyone slows down.',
			emotions: ['calm', 'joy'],
			themes: ['sunset', 'skyline', 'walk'],
			who: 'local'
		}
	],
	'Roosevelt Island': [
		{
			quote: 'Water on both sides and almost nobody else; the loop felt like a secret.',
			emotions: ['calm', 'belonging'],
			themes: ['water', 'quiet', 'running'],
			who: 'runner'
		},
		{
			quote: 'Running under the bridge with Manhattan on my left, I felt free of it for an hour.',
			emotions: ['exhilaration', 'calm'],
			themes: ['running', 'water', 'skyline'],
			who: 'runner'
		}
	],
	'Hudson River Greenway': [
		{
			quote: 'Sunset over Jersey with the whole river glowing, I ran slower on purpose.',
			emotions: ['calm', 'gratitude'],
			themes: ['sunset', 'water', 'running'],
			who: 'runner'
		},
		{
			quote: 'Miles of uninterrupted path; I found a rhythm I have not had since college.',
			emotions: ['exhilaration', 'nostalgia'],
			themes: ['running', 'water'],
			who: 'long-distance runner'
		}
	],
	'Fort Tilden': [
		{
			quote:
				'Ocean in front, the faint skyline behind; it is the closest NYC gets to feeling far away.',
			emotions: ['calm', 'awe'],
			themes: ['ocean', 'quiet', 'skyline'],
			who: 'beach walker'
		},
		{
			quote: 'Climbing the old battery and seeing the Atlantic and the city at once felt unreal.',
			emotions: ['awe', 'exhilaration'],
			themes: ['ocean', 'skyline', 'viewpoint'],
			who: 'explorer'
		}
	],
	'Coney Island Boardwalk': [
		{
			quote:
				'The boardwalk at dawn is empty and the ocean is loud; it felt like being a kid again.',
			emotions: ['nostalgia', 'joy'],
			themes: ['ocean', 'sunrise', 'running'],
			who: 'runner'
		},
		{
			quote:
				'Salt air and the Wonder Wheel in the distance; my dad brought me here and now I bring my son.',
			emotions: ['nostalgia', 'belonging'],
			themes: ['family', 'ocean'],
			who: 'parent'
		}
	],
	'Rockaway Beach Boardwalk': [
		{
			quote:
				'Long flat miles with the surf beside you; nothing to look at but the ocean, which is the point.',
			emotions: ['calm', 'exhilaration'],
			themes: ['ocean', 'running'],
			who: 'runner'
		},
		{
			quote: 'Surfers at sunrise and a coffee at the end; I forgot I was still in the city.',
			emotions: ['joy', 'calm'],
			themes: ['ocean', 'sunrise'],
			who: 'early riser'
		}
	],
	'The High Line': [
		{
			quote:
				'Walking above the streets with the Empire State peeking between buildings felt like a movie.',
			emotions: ['joy', 'awe'],
			themes: ['skyline', 'walk'],
			who: 'visitor'
		},
		{
			quote: 'Crowded, yes, but the gardens and the glimpses of the river made me happy anyway.',
			emotions: ['joy'],
			themes: ['gardens', 'walk', 'lively'],
			who: 'walker'
		}
	],
	'Little Island': [
		{
			quote: 'Sat at the top at sunset and felt grateful for a city that builds things like this.',
			emotions: ['gratitude', 'calm'],
			themes: ['sunset', 'water'],
			who: 'walker'
		},
		{
			quote: 'The tulip-shaped piers over the Hudson made my daughter gasp, and then me.',
			emotions: ['awe', 'joy'],
			themes: ['family', 'water'],
			who: 'parent'
		}
	],
	'East River Esplanade': [
		{
			quote:
				'Straight shot along the water with the Queens skyline; good for the days you just need to move.',
			emotions: ['calm', 'exhilaration'],
			themes: ['water', 'running'],
			who: 'runner'
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
		const display = s.who ?? 'Explorin field note';
		await sql`INSERT INTO reflections (place_id, source, display_name, body, quote, emotions, themes, consent_share, embedding)
		          VALUES (${p.id}, 'seed', ${display}, ${s.quote}, ${s.quote}, ${s.emotions}, ${s.themes}, true, ${vec(emb)}::vector)`;
		n++;
	}
}
console.log(`inserted ${n} seed reflections`);
await sql.end();
