import type { Traits } from '#lib/types';

export interface Persona {
	id: string;
	name: string;
	traits: Traits;
	reflections?: {
		place: string;
		text: string;
		quote?: string;
		emotions: string[];
		themes: string[];
		new_place?: { kind: string; lat: number; lng: number; tags: string[]; notes: string } | null;
	}[];
}

/** Built-in preset profiles for the demo's second phone (no photo onboarding needed). */
export const BUILTIN: Persona[] = [
	{
		id: 'runner',
		name: 'Maya',
		traits: {
			activities: [{ name: 'running', confidence: 0.95, evidence: 'preset persona' }],
			scenery: ['waterfront', 'skyline'],
			pace: 'active',
			social: 'solo',
			time_of_day: ['sunrise'],
			values: ['morning routine', 'scenic views'],
			avoid: ['crowds'],
			summary:
				'You are an early-morning runner who loves waterfront routes with a skyline in view, and you prefer quiet paths over crowds.'
		}
	},
	{
		id: 'family',
		name: 'Sam',
		traits: {
			activities: [
				{ name: 'walking', confidence: 0.9, evidence: 'preset persona' },
				{ name: 'photography', confidence: 0.6, evidence: 'preset persona' }
			],
			scenery: ['parks', 'harbor', 'bridges'],
			pace: 'chill',
			social: 'small_group',
			time_of_day: ['evening', 'sunset'],
			values: ['family', 'nostalgia'],
			avoid: ['long distances'],
			summary:
				'You explore the city at a relaxed pace with family, drawn to parks and harbor views at sunset, and places that stir memories.'
		}
	},
	{
		id: 'ocean',
		name: 'Lee',
		traits: {
			activities: [
				{ name: 'running', confidence: 0.8, evidence: 'preset persona' },
				{ name: 'swimming', confidence: 0.5, evidence: 'preset persona' }
			],
			scenery: ['ocean', 'beach'],
			pace: 'moderate',
			social: 'solo',
			time_of_day: ['sunrise'],
			values: ['solitude', 'nature'],
			avoid: ['traffic noise'],
			summary:
				'You want the ocean: long flat runs by the surf, salt air, and as little of the city as possible.'
		}
	}
];

/** Built-in personas plus any JSON files in data/personas/ (gitignored, dev/node only). */
export async function loadPersonas(): Promise<Persona[]> {
	const custom: Persona[] = [];
	try {
		const { readdir, readFile } = await import('node:fs/promises');
		const { join } = await import('node:path');
		const dir = join(process.cwd(), 'data', 'personas');
		for (const f of await readdir(dir)) {
			if (!f.endsWith('.json')) continue;
			try {
				const p = JSON.parse(await readFile(join(dir, f), 'utf8')) as Persona;
				if (p?.id && p?.name && p?.traits?.summary) custom.push(p);
			} catch (e) {
				console.warn(`persona ${f} skipped:`, (e as Error).message);
			}
		}
	} catch {
		/* no data dir or no fs (Workers): built-ins only */
	}
	return [...custom, ...BUILTIN.filter((b) => !custom.some((c) => c.id === b.id))];
}
