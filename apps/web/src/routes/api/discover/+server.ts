import { error, json } from '@sveltejs/kit';
import {
	discoverInput,
	runDiscovery,
	type DiscoveryEvent,
	type DiscoveryStep
} from '#lib/server/discover';
import { parseBody } from '#lib/server/http';
import type { RequestHandler } from './$types';

/**
 * POST /api/discover. With `Accept: application/x-ndjson` the response streams one JSON
 * event per line (pipeline steps, then the result or an error) so the UI can show the work
 * as it happens. Otherwise it answers with the final result as plain JSON.
 */
export const POST: RequestHandler = async ({ request }) => {
	const input = await parseBody(
		request,
		discoverInput,
		'Add an experience prompt and a city (keep the prompt under 800 characters).'
	);

	if (request.headers.get('accept')?.includes('application/x-ndjson')) {
		const encoder = new TextEncoder();
		let closed = false;
		const stream = new ReadableStream<Uint8Array>({
			async start(controller) {
				const send = (event: DiscoveryEvent) => {
					if (!closed) controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
				};
				try {
					await runDiscovery(input, send);
				} catch (e) {
					console.error('[POST /api/discover]', e);
					send({ type: 'error', status: 500, error: 'Discovery failed. Please try again.' });
				}
				if (!closed) controller.close();
				closed = true;
			},
			cancel() {
				closed = true; // the viewer left; later events are dropped instead of throwing
			}
		});
		return new Response(stream, {
			headers: {
				'Content-Type': 'application/x-ndjson; charset=utf-8',
				'Cache-Control': 'no-store',
				'X-Accel-Buffering': 'no'
			}
		});
	}

	let final: Extract<DiscoveryEvent, { type: 'result' | 'error' }> | undefined;
	const steps: DiscoveryStep[] = [];
	await runDiscovery(input, (event) => {
		if (event.type === 'step') steps.push(event.step);
		else final = event;
	});
	if (!final) error(500, 'Discovery failed.');
	if (final.type === 'error') error(final.status, final.error);
	return json({ ...final.result, steps });
};
