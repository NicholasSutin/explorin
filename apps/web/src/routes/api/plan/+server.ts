import { error } from '@sveltejs/kit';
import { parseBody } from '#lib/server/http';
import { planInput, runPlan, type PlanEvent } from '#lib/server/plan';
import { creditsThisMonth } from '#lib/server/account';
import { monthlyCredits } from '#lib/server/usage';
import type { RequestHandler } from './$types';

/**
 * POST /api/plan -> newline-delimited JSON: pipeline steps as they happen, then `{type:"result", tripId}` or an
 * error. Refuses with 429 once this month's credits are spent, before any paid call is made.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const input = await parseBody(
		request,
		planInput,
		'Tell us what you feel like doing (a few words is fine).'
	);
	const used = await creditsThisMonth(locals.uid);
	if (used >= monthlyCredits())
		error(
			429,
			`You've used this month's ${monthlyCredits().toLocaleString()} credits. They reset on the 1st; see Settings for the breakdown.`
		);

	const encoder = new TextEncoder();
	let closed = false;
	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			const send = (event: PlanEvent) => {
				if (!closed) controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
			};
			try {
				await runPlan(locals.uid, input, send);
			} catch (e) {
				console.error('[POST /api/plan]', e);
				send({ type: 'error', status: 500, error: 'Planning failed. Please try again.' });
			}
			if (!closed) controller.close();
			closed = true;
		},
		cancel() {
			closed = true; // the viewer left; the plan still finishes and is saved, later events are dropped
		}
	});
	return new Response(stream, {
		headers: {
			'Content-Type': 'application/x-ndjson; charset=utf-8',
			'Cache-Control': 'no-store',
			'X-Accel-Buffering': 'no'
		}
	});
};
