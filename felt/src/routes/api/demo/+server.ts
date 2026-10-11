import { json, type RequestHandler } from '@sveltejs/kit';
import { sql } from '#lib/server/db';

/** Health + counts, handy during the hackathon. */
export const GET: RequestHandler = async () => {
	const [c] = await sql<
		{ places: number; reflections: number; users: number; user_reflections: number }[]
	>`
		SELECT (SELECT count(*) FROM places)::int AS places,
		       (SELECT count(*) FROM reflections)::int AS reflections,
		       (SELECT count(*) FROM reflections WHERE source = 'user')::int AS user_reflections,
		       (SELECT count(*) FROM users)::int AS users`;
	return json({ ok: true, ...c });
};
