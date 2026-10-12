/** Cloudflare bindings (rate limiters, Hyperdrive, R2) from the Workers runtime. Swapped in by the `#bindings` alias. */
import { env } from 'cloudflare:workers';

export const bindings = env as unknown as Record<string, unknown>;
export const onWorkers = true;
