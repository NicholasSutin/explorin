import { getRequestEvent } from '$app/server';
import { waitUntil } from '#bindings';

/**
 * Run work that outlives the response (learning from a trip note). Workers cancel a request's
 * pending promises once its response is done unless they are registered with `waitUntil`, which
 * `cloudflare:workers` exports for use anywhere in request scope (budget: about 30 s after the response is
 * sent). The promise is also recorded on `locals` so hooks.server.ts keeps this request's database
 * connection open until it settles. Under adapter-node this is a plain fire-and-forget.
 */
export function background(task: Promise<unknown>): void {
	const settled = task.then(
		() => undefined,
		(e) => console.warn('[background] task failed:', (e as Error)?.message ?? e)
	);
	try {
		getRequestEvent().locals.background?.push(settled);
	} catch {
		/* outside a request (build analysis, scripts) */
	}
	try {
		waitUntil(settled);
	} catch {
		/* no request context (dev tooling); the promise still runs */
	}
}
