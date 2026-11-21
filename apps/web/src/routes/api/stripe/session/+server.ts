import { error } from '@sveltejs/kit';
import { billingPortal, checkoutConfigured, startCheckout } from '#lib/server/billing';
import type { RequestHandler } from './$types';

/**
 * The Settings buttons post here (a plain form, so it works before hydration): `checkout` opens Stripe Checkout,
 * `portal` the billing portal. Problems come back to Settings as `?billing=…`; Stripe's details go to the log.
 */
export const POST: RequestHandler = async ({ request, locals, url }) => {
	if (!locals.user) error(401, 'Sign in to continue.');
	if (request.headers.get('origin') !== url.origin) error(403, 'Invalid billing request origin.');
	const operation = (await request.formData()).get('operation');
	if (operation !== 'checkout' && operation !== 'portal') error(400, 'Invalid billing operation.');
	const back = (status: string) =>
		Response.redirect(new URL(`/settings?billing=${status}`, url), 303);
	if (operation === 'checkout' && !checkoutConfigured()) return back('unavailable');

	try {
		const destination =
			operation === 'checkout'
				? await startCheckout(locals.uid, locals.user.email, url.origin)
				: await billingPortal(locals.uid, url.origin);
		if (!destination) return back(operation === 'checkout' ? 'existing' : 'no-account');
		const target = new URL(destination);
		const host = operation === 'checkout' ? 'checkout.stripe.com' : 'billing.stripe.com';
		if (target.origin !== `https://${host}`) throw new Error('Unexpected Stripe redirect origin.');
		return Response.redirect(target, 303);
	} catch (err) {
		console.error(`[Stripe ${operation}]`, err);
		return back(`${operation}-failed`);
	}
};
