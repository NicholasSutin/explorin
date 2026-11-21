import { error } from '@sveltejs/kit';
import { syncSubscription, verifyStripeSignature } from '#lib/server/billing';
import type { RequestHandler } from './$types';

const subscriptionEvents = new Set([
	'customer.subscription.created',
	'customer.subscription.updated',
	'customer.subscription.deleted',
	'customer.subscription.paused',
	'customer.subscription.resumed'
]);

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
		await syncSubscription(customer);
	}
	return new Response(null, { status: 204 });
};
