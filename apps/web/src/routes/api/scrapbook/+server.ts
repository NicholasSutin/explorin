import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { parseBody } from '#lib/server/http';
import { saveBookLook } from '#lib/server/scrapbook';
import { isValidStyle } from '#lib/scrapbook/style';
import type { RequestHandler } from './$types';

const style = (kind: 'page' | 'cover') =>
	z
		.record(z.string(), z.unknown())
		.refine((v) => isValidStyle(v, kind), `That ${kind} style isn’t one we know.`);

const Body = z
	.object({
		cover: style('cover').optional(),
		pageDefault: style('page').optional(),
		resetPages: z.boolean().optional()
	})
	.strict()
	.refine((b) => b.cover || b.pageDefault || b.resetPages, 'Nothing to change.');

/**
 * PATCH /api/scrapbook: the cover, and/or the look for pages without their own. `resetPages` clears every page's own
 * look, so with `pageDefault` the whole book (and every new day) takes one look.
 */
export const PATCH: RequestHandler = async ({ request, locals }) => {
	const body = await parseBody(request, Body);
	await saveBookLook(locals.uid, body);
	return json({ ok: true });
};
