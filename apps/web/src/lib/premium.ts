/**
 * Explorin Premium facts shared by the app and scripts/stripe-setup.ts, which creates the Stripe side from them.
 * No SvelteKit imports here: the setup script runs under plain Node.
 */

/** Pinned so responses keep their shape whatever the Stripe account's default version is. */
export const STRIPE_API_VERSION = '2025-12-15.clover';

export const PREMIUM_PRICE = {
	product: 'Explorin Premium',
	lookupKey: 'explorin_premium_monthly',
	currency: 'usd',
	unitAmount: 499,
	interval: 'month'
} as const;

export const premiumPriceLabel = `$${(PREMIUM_PRICE.unitAmount / 100).toFixed(2)} a ${PREMIUM_PRICE.interval}`;

/** Metadata on the billing portal configuration the setup script makes, so the app can find it. */
export const PORTAL_METADATA = { key: 'explorin', value: 'premium' } as const;

/** What the webhook endpoint listens to. Each one makes the app re-read the customer's subscriptions. */
export const SUBSCRIPTION_EVENTS = [
	'customer.subscription.created',
	'customer.subscription.updated',
	'customer.subscription.deleted',
	'customer.subscription.paused',
	'customer.subscription.resumed'
] as const;
