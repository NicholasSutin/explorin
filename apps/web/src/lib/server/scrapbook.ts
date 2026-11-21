/**
 * How someone's scrapbook looks: the cover and the look for new pages (`scrapbooks`), and each day's own page look
 * (`trips.page_style`). Only values that `#lib/scrapbook/style` accepts are stored, and stored values are cleaned
 * again on the way out, so an old or hand-edited row can't break a page.
 */
import { error } from '@sveltejs/kit';
import { sql } from './db';
import {
	cleanCoverStyle,
	cleanPageStyle,
	type CoverStyle,
	type PageStyle
} from '#lib/scrapbook/style';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface BookLook {
	cover: Partial<CoverStyle>;
	/** The look of pages that have none of their own. */
	pageDefault: Partial<PageStyle>;
	/** Pages with their own look, by trip id. */
	pages: Record<string, Partial<PageStyle>>;
}

export async function getBookLook(uid: string): Promise<BookLook> {
	const [[book], pages] = await Promise.all([
		sql<{ cover: unknown; page_default: unknown }[]>`
			SELECT cover, page_default FROM scrapbooks WHERE user_id = ${uid}`,
		sql<{ id: string; page_style: unknown }[]>`
			SELECT id, page_style FROM trips
			WHERE user_id = ${uid} AND status = 'finished' AND page_style <> '{}'::jsonb`
	]);
	return {
		cover: cleanCoverStyle(book?.cover),
		pageDefault: cleanPageStyle(book?.page_default),
		pages: Object.fromEntries(pages.map((p) => [p.id, cleanPageStyle(p.page_style)]))
	};
}

/** A day's own page look; `{}` puts the page back on the book's look. Only finished days are pages. */
export async function setPageStyle(uid: string, tripId: string, style: Partial<PageStyle>) {
	if (!UUID.test(tripId)) error(404, 'Page not found');
	const rows = await sql`
		UPDATE trips SET page_style = ${sql.json(cleanPageStyle(style))}
		WHERE id = ${tripId} AND user_id = ${uid} AND status = 'finished' RETURNING id`;
	if (!rows.length) error(404, 'Page not found');
}

/**
 * Change the cover and/or the look for pages. `resetPages` clears every page's own look in the same transaction,
 * which is how "use this look on every page" makes the whole book match.
 */
export async function saveBookLook(
	uid: string,
	patch: { cover?: Partial<CoverStyle>; pageDefault?: Partial<PageStyle>; resetPages?: boolean }
) {
	const cover = patch.cover ? cleanCoverStyle(patch.cover) : null;
	const pageDefault = patch.pageDefault ? cleanPageStyle(patch.pageDefault) : null;
	await sql.begin(async (tx) => {
		await tx`
			INSERT INTO scrapbooks (user_id, cover, page_default)
			VALUES (${uid}, ${sql.json(cover ?? {})}, ${sql.json(pageDefault ?? {})})
			ON CONFLICT (user_id) DO UPDATE SET
			  cover = CASE WHEN ${cover !== null} THEN EXCLUDED.cover ELSE scrapbooks.cover END,
			  page_default = CASE WHEN ${pageDefault !== null} THEN EXCLUDED.page_default ELSE scrapbooks.page_default END,
			  updated_at = now()`;
		if (patch.resetPages)
			await tx`UPDATE trips SET page_style = '{}'::jsonb
			         WHERE user_id = ${uid} AND page_style <> '{}'::jsonb`;
	});
}
