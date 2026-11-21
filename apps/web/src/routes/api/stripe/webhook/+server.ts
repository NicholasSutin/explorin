import { error } from '@sveltejs/kit';
import { syncCustomer, verifyStripeSignature } from '#lib/server/billing';
import { SUBSCRIPTION_EVENTS } from '#lib/premium';
import type { RequestHandler } from './$types';

const subscriptionEvents = new Set<string>(SUBSCRIPTION_EVENTS);

/**
 * Stripe's webhook (public: hooks.server.ts lets it past the sign-in guard). The signature is checked on the raw
 * body; a subscription event then re-reads that customer's subscriptions from Stripe, so the event's own snapshot
 * is never trusted. A failure answers 500 and Stripe retries with backoff for up to three days.
 */
export const POST: RequestHandler = async ({ request }) => {
	const signature = request.headers.get('stripe-signature');
	if (!signature) error(400, 'Missing Stripe signature.');
	const body = await request.text();
	if (!(await verifyStripeSignature(body, signature))) error(400, 'Invalid Stripe signature.');

	const event = JSON.parse(body);
	if (subscriptionEvents.has(event.type)) {
		const customer = event.data?.object?.customer;
		if (typeof customer !== 'string' || !customer.startsWith('cus_')) {
			error(400, 'Missing Stripe customer.');
		}
		await syncCustomer(customer);
	}
	return new Response(null, { status: 204 });
};
