import { json, error, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { sql } from '#lib/server/db';

const Body = z.object({ experienceId: z.string().uuid() });

/** POST = start, PATCH = finish. Both scoped to the cookie user. */
export const POST: RequestHandler = async ({ request, locals }) => {
	const parsed = Body.safeParse(await request.json());
	if (!parsed.success) error(400, 'Bad request');
	const rows =
		await sql`UPDATE experiences SET status = 'started', started_at = COALESCE(started_at, now())
	                       WHERE id = ${parsed.data.experienceId} AND user_id = ${locals.uid} RETURNING id, started_at`;
	if (!rows.length) error(404, 'Experience not found');
	return json(rows[0]);
};

export const PATCH: RequestHandler = async ({ request, locals }) => {
	const parsed = Body.safeParse(await request.json());
	if (!parsed.success) error(400, 'Bad request');
	const rows = await sql`UPDATE experiences SET status = 'finished', finished_at = now()
	                       WHERE id = ${parsed.data.experienceId} AND user_id = ${locals.uid} RETURNING id, started_at, finished_at`;
	if (!rows.length) error(404, 'Experience not found');
	return json(rows[0]);
};
