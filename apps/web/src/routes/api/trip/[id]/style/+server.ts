import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { parseBody } from '#lib/server/http';
import { setPageStyle } from '#lib/server/scrapbook';
import { cleanPageStyle, isValidStyle } from '#lib/scrapbook/style';
import type { RequestHandler } from './$types';

const Body = z.object({
	style: z
		.record(z.string(), z.unknown())
		.refine((v) => isValidStyle(v, 'page'), 'That page style isn’t one we know.')
});

/** PUT /api/trip/<id>/style: the day's scrapbook page look; `{}` returns it to the book's look. */
export const PUT: RequestHandler = async ({ request, params, locals }) => {
	const { style } = await parseBody(request, Body);
	await setPageStyle(locals.uid, params.id, cleanPageStyle(style));
	return json({ ok: true });
};
