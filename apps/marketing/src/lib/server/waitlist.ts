/**
 * Waitlist storage on Cloudflare D1. One row per email; joining twice is not an error.
 * Schema lives in migrations/0001_waitlist.sql. Bindings come from `cloudflare:workers`
 * (real in Workers, proxied by the adapter in `vite dev`).
 */
import { env } from 'cloudflare:workers';
import { z } from 'zod';

const bindings = env as { WAITLIST?: D1Database };
export const waitlistEnabled = () => Boolean(bindings.WAITLIST);

export const email = z
	.string()
	.trim()
	.toLowerCase()
	.max(254)
	.email('That does not look like an email address.');

export async function join(address: string, source: string | null): Promise<'added' | 'already'> {
	const result = await bindings
		.WAITLIST!.prepare(
			'INSERT INTO waitlist (email, source) VALUES (?1, ?2) ON CONFLICT(email) DO NOTHING'
		)
		.bind(address, source)
		.run();
	return result.meta.changes ? 'added' : 'already';
}

export async function count(): Promise<number> {
	const row = await bindings.WAITLIST!.prepare('SELECT count(*) AS n FROM waitlist').first<{
		n: number;
	}>();
	return row?.n ?? 0;
}
