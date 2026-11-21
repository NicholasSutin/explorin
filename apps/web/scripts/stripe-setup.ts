/**
 * Sets up Explorin Premium in the Stripe account behind STRIPE_SECRET_KEY (a sandbox or live, from the key). Safe to
 * run again: it finds what it made before and brings it up to date.
 *
 *   npm run stripe:setup                         # .env: the price and the billing portal
 *   npm run stripe:setup:prod -- --webhook https://app.explorin.app/api/stripe/webhook
 *
 * 1. Price: found by its lookup key. When PREMIUM_PRICE in src/lib/premium.ts changes, a new price takes the
 *    lookup key over (Stripe prices are immutable); existing subscribers stay on theirs until they change.
 * 2. Billing portal configuration: cancel at period end, update the card, see invoices. Tagged in metadata so
 *    the app picks it (billing.ts), which avoids saving the default one in the Dashboard.
 * 3. With --webhook: an endpoint for the subscription events. Stripe shows its signing secret only when it is
 *    created; for an endpoint that already exists, keep the STRIPE_WEBHOOK_SECRET you have.
 *
 * Prints the env lines to add. Then `npm run secrets:web:new` (repo root) for production.
 */
import {
	PORTAL_METADATA,
	PREMIUM_PRICE,
	STRIPE_API_VERSION,
	SUBSCRIPTION_EVENTS,
	premiumPriceLabel
} from '../src/lib/premium';

const key = process.env.STRIPE_SECRET_KEY ?? '';
if (!/^(sk|rk)_(test|live)_/.test(key))
	fail('Set STRIPE_SECRET_KEY (sk_… or rk_…) in the env file.');
const live = key.includes('_live_');

const webhookAt = process.argv.indexOf('--webhook');
const webhookUrl = webhookAt === -1 ? null : (process.argv[webhookAt + 1] ?? '');
if (webhookUrl !== null && !/^https:\/\/[^/]+\/api\/stripe\/webhook$/.test(webhookUrl))
	fail('--webhook takes the public https URL ending in /api/stripe/webhook');

type Params = [string, string][];

async function stripe<T>(method: 'GET' | 'POST', path: string, params: Params = []): Promise<T> {
	const body = new URLSearchParams(params);
	const url = `https://api.stripe.com/v1/${path}${method === 'GET' && params.length ? `?${body}` : ''}`;
	const response = await fetch(url, {
		method,
		headers: { Authorization: `Bearer ${key}`, 'Stripe-Version': STRIPE_API_VERSION },
		body: method === 'POST' ? body : undefined
	});
	const json = (await response.json()) as { error?: { message?: string } };
	if (!response.ok) fail(`Stripe ${method} ${path}: ${json.error?.message ?? response.status}`);
	return json as T;
}

function fail(message: string): never {
	console.error(`stripe-setup: ${message}`);
	process.exit(1);
}

console.log(`Stripe ${live ? 'LIVE mode' : 'sandbox (test mode)'}\n`);

// 1. Price
type Price = {
	id: string;
	product: string;
	unit_amount: number;
	currency: string;
	recurring: { interval: string } | null;
};
const [current] = (
	await stripe<{ data: Price[] }>('GET', 'prices', [
		['lookup_keys[]', PREMIUM_PRICE.lookupKey],
		['active', 'true'],
		['limit', '1']
	])
).data;
const matches =
	current &&
	current.unit_amount === PREMIUM_PRICE.unitAmount &&
	current.currency === PREMIUM_PRICE.currency &&
	current.recurring?.interval === PREMIUM_PRICE.interval;
const price = matches
	? current
	: await stripe<Price>('POST', 'prices', [
			['currency', PREMIUM_PRICE.currency],
			['unit_amount', String(PREMIUM_PRICE.unitAmount)],
			['recurring[interval]', PREMIUM_PRICE.interval],
			['lookup_key', PREMIUM_PRICE.lookupKey],
			['transfer_lookup_key', 'true'],
			...((current
				? [['product', current.product]]
				: [['product_data[name]', PREMIUM_PRICE.product]]) as Params)
		]);
console.log(
	`price    ${price.id}  ${premiumPriceLabel}  (${matches ? 'existing' : current ? 'replaced ' + current.id : 'created'})`
);

// 2. Billing portal configuration
const portalFeatures: Params = [
	['features[subscription_cancel][enabled]', 'true'],
	['features[subscription_cancel][mode]', 'at_period_end'],
	['features[subscription_cancel][proration_behavior]', 'none'],
	['features[payment_method_update][enabled]', 'true'],
	['features[invoice_history][enabled]', 'true'],
	['features[customer_update][enabled]', 'false'],
	['features[subscription_update][enabled]', 'false'],
	['business_profile[headline]', PREMIUM_PRICE.product]
];
const configurations = await stripe<{
	data: { id: string; metadata: Record<string, string> | null }[];
}>('GET', 'billing_portal/configurations', [
	['active', 'true'],
	['limit', '100']
]);
const tagged = configurations.data.find(
	(c) => c.metadata?.[PORTAL_METADATA.key] === PORTAL_METADATA.value
);
const portal = tagged
	? await stripe<{ id: string }>(
			'POST',
			`billing_portal/configurations/${tagged.id}`,
			portalFeatures
		)
	: await stripe<{ id: string }>('POST', 'billing_portal/configurations', [
			...portalFeatures,
			[`metadata[${PORTAL_METADATA.key}]`, PORTAL_METADATA.value]
		]);
console.log(`portal   ${portal.id}  (${tagged ? 'updated' : 'created'})`);

// 3. Webhook endpoint
let secret: string | undefined;
if (webhookUrl) {
	const events: Params = SUBSCRIPTION_EVENTS.map((e) => ['enabled_events[]', e]);
	const endpoints = await stripe<{ data: { id: string; url: string }[] }>(
		'GET',
		'webhook_endpoints',
		[['limit', '100']]
	);
	const existing = endpoints.data.find((e) => e.url === webhookUrl);
	if (existing) {
		await stripe('POST', `webhook_endpoints/${existing.id}`, [...events, ['disabled', 'false']]);
		console.log(
			`webhook  ${existing.id}  ${webhookUrl}  (updated; keep your STRIPE_WEBHOOK_SECRET)`
		);
	} else {
		const created = await stripe<{ id: string; secret: string }>('POST', 'webhook_endpoints', [
			['url', webhookUrl],
			['api_version', STRIPE_API_VERSION],
			['description', `${PREMIUM_PRICE.product} subscriptions`],
			...events
		]);
		secret = created.secret;
		console.log(`webhook  ${created.id}  ${webhookUrl}  (created)`);
	}
}

console.log(`\nAdd to the env file you ran this with:\nSTRIPE_PRICE_ID=${price.id}`);
if (secret) console.log(`STRIPE_WEBHOOK_SECRET=${secret}`);
if (!webhookUrl)
	console.log(
		'STRIPE_WEBHOOK_SECRET=<from `stripe listen`, or rerun with --webhook <public URL> for a deployment>'
	);
