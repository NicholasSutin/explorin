import { json, error, type RequestHandler } from '@sveltejs/kit';
import { loadPersonas } from '#lib/server/personas';
import { embed } from '#lib/server/gemini';
import { ensureUser, getProfile, upsertProfile } from '#lib/server/db';

/** POST { persona } -> creates a preset profile for the current cookie user (demo shortcut). */
export const POST: RequestHandler = async ({ request, locals }) => {
	const { persona } = (await request.json().catch(() => ({}))) as { persona?: string };
	const p = (await loadPersonas()).find((x) => x.id === persona);
	if (!p) error(400, 'Unknown persona');
	await ensureUser(locals.uid, p.name);
	await upsertProfile(locals.uid, p.traits, await embed(p.traits.summary, 'doc'));
	return json({ profile: await getProfile(locals.uid) });
};

export const GET: RequestHandler = async () =>
	json({
		personas: (await loadPersonas()).map((p) => ({
			id: p.id,
			name: p.name,
			label: p.traits.activities[0]?.name ?? 'explorer',
			summary: p.traits.summary
		}))
	});
