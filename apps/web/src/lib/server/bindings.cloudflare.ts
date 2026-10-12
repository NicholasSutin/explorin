/** Cloudflare bindings (rate limiters, Hyperdrive, R2) from the Workers runtime. Swapped in by the `#bindings` alias. */
import { env } from 'cloudflare:workers';

export const bindings = env as unknown as Record<string, unknown>;
export const onWorkers = true;
/** Extends the request past its response until the promise settles. Importable anywhere; no `ctx` needed. */
export { waitUntil } from 'cloudflare:workers';
