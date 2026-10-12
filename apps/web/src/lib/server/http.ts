/**
 * Small shared plumbing for server modules and API routes: timed fetch, JSON fetch that
 * degrades to null, a bounded TTL cache, and body validation that fails with SvelteKit's
 * `error()` so every route answers `{ message }` on bad input.
 */
import { error } from '@sveltejs/kit';
import { z } from 'zod';

export const DAY = 24 * 60 * 60 * 1000;

/** `fetch` that aborts after `timeoutMs`. */
export function timedFetch(
	url: string,
	init: RequestInit = {},
	timeoutMs = 8000
): Promise<Response> {
	return fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}

/** GET/POST JSON; null on a non-2xx response, network error or timeout. */
export async function fetchJson<T>(
	url: string,
	init: RequestInit = {},
	timeoutMs = 8000
): Promise<T | null> {
	try {
		const res = await timedFetch(url, init, timeoutMs);
		return res.ok ? ((await res.json()) as T) : null;
	} catch {
		return null;
	}
}

/**
 * In-memory cache with a TTL and a size cap (oldest insert evicted first). Expired entries are
 * dropped on read. Cached `null` values are returned as `null`; a miss is `undefined`.
 */
export function ttlCache<V>(ttlMs: number, max = 1000) {
	const store = new Map<string, { at: number; value: V }>();
	return {
		get(key: string): V | undefined {
			const hit = store.get(key);
			if (!hit) return undefined;
			if (Date.now() - hit.at >= ttlMs) {
				store.delete(key);
				return undefined;
			}
			return hit.value;
		},
		set(key: string, value: V): V {
			if (!store.has(key) && store.size >= max) store.delete(store.keys().next().value!);
			store.set(key, { at: Date.now(), value });
			return value;
		}
	};
}

/** A photo reference the app itself produced: a storage key or an inline data URL. Never a remote URL. */
export const photoUrl = z
	.string()
	.max(12 * 1024 * 1024)
	.regex(
		/^(\/photos\/[A-Za-z0-9-]+\/[A-Za-z0-9-]+\.(jpg|png|webp)|data:image\/(jpeg|png|webp);base64,)/
	);

/** Parse and validate a JSON request body, or fail the request with 400 and a readable message. */
export async function parseBody<T>(
	request: Request,
	schema: z.ZodType<T>,
	message?: string
): Promise<T> {
	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		error(400, message ?? 'Bad request');
	}
	const parsed = schema.safeParse(raw);
	if (!parsed.success) error(400, message ?? parsed.error.issues[0]?.message ?? 'Bad request');
	return parsed.data;
}
