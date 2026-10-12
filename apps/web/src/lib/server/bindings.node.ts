/** No Cloudflare bindings under adapter-node / `vite dev`. Swapped in by the `#bindings` alias. */
export const bindings: Record<string, unknown> = {};
export const onWorkers = false;
/** Node keeps running after the response, so there is nothing to extend. */
export const waitUntil = (_promise: Promise<unknown>): void => {};
