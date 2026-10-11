import { json } from '@sveltejs/kit';
import {
	discoverInput,
	runDiscovery,
	type DiscoveryEvent,
	type DiscoveryStep
} from '#lib/server/discover';
import type { RequestHandler } from './$types';

/**
 * POST /api/discover. With `Accept: application/x-ndjson` the response streams one JSON
 * event per line (pipeline steps, then the result or an error) so the UI can show the work
 * as it happens. Otherwise it answers with the final result as plain JSON.
 */
export const POST: RequestHandler = async ({ request }) => {
	let body;
	try {
		body = discoverInput.safeParse(await request.json());
	} catch {
		return json({ error: 'Please send a valid discovery request.' }, { status: 400 });
	}
	if (!body.success)
		return json(
			{ error: 'Add an experience prompt and a city (keep the prompt under 800 characters).' },
			{ status: 400 }
		);
	const input = body.data;

	if (request.headers.get('accept')?.includes('application/x-ndjson')) {
		const encoder = new TextEncoder();
		const stream = new ReadableStream<Uint8Array>({
			async start(controller) {
				const send = (event: DiscoveryEvent) =>
					controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
				try {
					await runDiscovery(input, send);
				} catch (e) {
					send({
						type: 'error',
						status: 500,
						error: e instanceof Error ? e.message : 'Discovery failed. Please try again.'
					});
				}
				controller.close();
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
	if (!final) return json({ error: 'Discovery failed.' }, { status: 500 });
	if (final.type === 'error') return json({ error: final.error }, { status: final.status });
	return json({ ...final.result, steps });
};
