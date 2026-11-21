/**
 * Explorin Premium on Stripe (ADR-0011): Checkout to subscribe, the billing portal to manage, a webhook to follow
 * changes. Stripe is the source of truth. Every sync re-reads the customer's subscriptions instead of trusting an
 * event's snapshot, so replays and out-of-order deliveries settle on the current state. Calls go straight to the
 * REST API (no SDK) and run under a row lock on `users`, which serialises Checkout, syncs and account deletion
 * per person.
 */
import {
	BETTER_AUTH_URL,
	STRIPE_PRICE_ID,
	STRIPE_SECRET_KEY,
	STRIPE_WEBHOOK_SECRET
} from '$app/env/private';
import type { TransactionSql } from 'postgres';
import { PORTAL_METADATA, STRIPE_API_VERSION } from '#lib/premium';
import { sql } from './db';

type Billing = {
	stripe_customer_id: string;
	checkout_session_id: string | null;
	subscription_status: string | null;
};
type CheckoutSession = { id: string; status: 'open' | 'complete' | 'expired'; url: string | null };

/** Paid up, or a renewal failed and Stripe is still retrying it (past_due): Premium stays on meanwhile. */
const grantsPremium = (status: string | null) =>
	status === 'active' || status === 'trialing' || status === 'past_due';
/** A subscription that isn't over yet. A second Checkout would bill the person twice. */
const blocksCheckout = (status: string | null) =>
	status !== null && status !== 'canceled' && status !== 'incomplete_expired';

export const checkoutConfigured = () =>
	Boolean(STRIPE_SECRET_KEY && STRIPE_PRICE_ID?.startsWith('price_') && STRIPE_WEBHOOK_SECRET);

const settingsUrl = (origin: string, query = '') =>
	new URL(`/settings${query}`, BETTER_AUTH_URL ?? origin).href;

export class StripeRequestError extends Error {
	constructor(
		readonly status: number,
		readonly code: string | undefined,
		message: string
	) {
		super(message);
	}
}

/** Ids we read from our own table still go into URL paths, so check their shape first. */
function stripeId(id: string, prefix: string) {
	if (!new RegExp(`^${prefix}_\\w+$`).test(id))
		throw new Error(`Malformed Stripe id for ${prefix}`);
	return id;
}

async function stripe<T>(
	method: 'GET' | 'POST' | 'DELETE',
	path: string,
	fields?: Record<string, string>,
	idempotencyKey?: string
): Promise<T> {
	const headers = new Headers({
		Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
		'Stripe-Version': STRIPE_API_VERSION
	});
	if (idempotencyKey) headers.set('Idempotency-Key', idempotencyKey);
	const response = await fetch(`https://api.stripe.com/v1/${path}`, {
		method,
		body: fields ? new URLSearchParams(fields) : undefined,
		headers,
		redirect: 'error',
		signal: AbortSignal.timeout(8000)
	});
	if (!response.ok) {
		const payload = (await response.json().catch(() => null)) as {
			error?: { code?: string; type?: string };
		} | null;
		const code = payload?.error?.code ?? payload?.error?.type;
		const requestId = response.headers.get('request-id');
		const details = [code, requestId].filter((value) => value && /^[\w-]+$/.test(value));
		throw new StripeRequestError(
			response.status,
			code,
			`Stripe ${method} ${path.split('?')[0]} returned HTTP ${response.status}${details.length ? ` (${details.join(', ')})` : ''}`
		);
	}
	return (await response.json()) as T;
}

/**
 * The status that decides access: a subscription that grants Premium, else one that's still open, else null.
 * Explorin creates these customers only for Premium, so every subscription on one counts, and subscribers on an
 * older price keep Premium if STRIPE_PRICE_ID changes.
 */
async function latestStatus(customer: string): Promise<string | null> {
	const query = new URLSearchParams({ customer, status: 'all', limit: '100' });
	let open: string | null = null;
	while (true) {
		const { data, has_more } = await stripe<{
			data: { id: string; status: string }[];
			has_more: boolean;
		}>('GET', `subscriptions?${query}`);
		for (const subscription of data) {
			if (grantsPremium(subscription.status)) return subscription.status;
			if (blocksCheckout(subscription.status)) open ??= subscription.status;
		}
		if (!has_more || data.length === 0) return open;
		query.set('starting_after', data[data.length - 1].id);
	}
}

async function lockUser(tx: TransactionSql, uid: string) {
	const [user] = await tx`SELECT id FROM users WHERE id = ${uid} FOR UPDATE`;
	return Boolean(user);
}

async function billingFor(tx: TransactionSql, uid: string) {
	const [billing] = await tx<Billing[]>`SELECT * FROM premium_billing WHERE user_id = ${uid}`;
	return billing;
}

export interface PremiumStatus {
	/** Gets the Premium allowance. */
	active: boolean;
	/** Has a subscription that isn't over (so no second Checkout). */
	subscribed: boolean;
	/** Stripe's subscription status, for the Settings notice. */
	status: string | null;
	/** Can open the billing portal. */
	manage: boolean;
}

/** From our table only (the webhook and returns from Stripe keep it current); no Stripe call. */
export async function premiumStatus(uid: string): Promise<PremiumStatus> {
	let status: string | null = null;
	try {
		const [billing] = await sql<Pick<Billing, 'subscription_status'>[]>`
			SELECT subscription_status FROM premium_billing WHERE user_id = ${uid}`;
		status = billing?.subscription_status ?? null;
	} catch (e) {
		// premium_billing arrives with this release's schema.sql, applied before the deploy (ADR-0009). If the order
		// slips, everyone is on the free allowance until it lands, and planning keeps working.
		if ((e as { code?: string }).code !== '42P01') throw e;
	}
	return {
		active: grantsPremium(status),
		subscribed: blocksCheckout(status),
		status,
		manage: status !== null && Boolean(STRIPE_SECRET_KEY)
	};
}

/** A Checkout URL, or null when the person already has a subscription that isn't over. */
export async function startCheckout(uid: string, email: string, origin: string) {
	if (!checkoutConfigured()) throw new Error('Checkout is unavailable');
	const price = STRIPE_PRICE_ID!;
	return sql.begin(async (tx) => {
		if (!(await lockUser(tx, uid))) throw new Error('Account is unavailable');
		let billing = await billingFor(tx, uid);
		if (!billing) {
			// The key makes a retry after a rolled-back transaction get the same customer back (Stripe keeps keys 24 h).
			const customer = await stripe<{ id: string }>(
				'POST',
				'customers',
				{ email, 'metadata[user_id]': uid },
				`explorin-customer-${uid}`
			);
			[billing] = await tx<Billing[]>`
				INSERT INTO premium_billing (user_id, stripe_customer_id)
				VALUES (${uid}, ${customer.id}) RETURNING *`;
		}
		const customer = stripeId(billing.stripe_customer_id, 'cus');
		const status = await latestStatus(customer);
		if (status !== billing.subscription_status)
			await tx`UPDATE premium_billing SET subscription_status = ${status} WHERE user_id = ${uid}`;
		if (blocksCheckout(status)) return null;

		// Reuse a Checkout that is still open (a second tab, a back button) instead of opening another.
		if (billing.checkout_session_id) {
			const previous = await stripe<CheckoutSession>(
				'GET',
				`checkout/sessions/${stripeId(billing.checkout_session_id, 'cs')}`
			);
			if (previous.status === 'open' && previous.url) return previous.url;
		}
		const session = await stripe<CheckoutSession>('POST', 'checkout/sessions', {
			mode: 'subscription',
			customer,
			client_reference_id: uid,
			'line_items[0][price]': price,
			'line_items[0][quantity]': '1',
			success_url: settingsUrl(origin, '?billing=complete'),
			cancel_url: settingsUrl(origin)
		});
		await tx`UPDATE premium_billing SET checkout_session_id = ${session.id} WHERE user_id = ${uid}`;
		return session.url;
	});
}

/** Portal configurations found by tag, per isolate. Only hits are kept, so running the setup script later works. */
let portalConfiguration: string | undefined;

async function findPortalConfiguration() {
	if (portalConfiguration) return portalConfiguration;
	const { data } = await stripe<{
		data: { id: string; metadata: Record<string, string> | null }[];
	}>('GET', 'billing_portal/configurations?active=true&limit=100');
	portalConfiguration = data.find(
		(c) => c.metadata?.[PORTAL_METADATA.key] === PORTAL_METADATA.value
	)?.id;
	return portalConfiguration;
}

/** A billing portal URL, or null without a Stripe customer. Uses the tagged configuration, else Stripe's default. */
export async function billingPortal(uid: string, origin: string) {
	if (!STRIPE_SECRET_KEY) return null;
	const [billing] = await sql<Pick<Billing, 'stripe_customer_id'>[]>`
		SELECT stripe_customer_id FROM premium_billing WHERE user_id = ${uid}`;
	if (!billing) return null;
	const configuration = await findPortalConfiguration();
	const session = await stripe<{ url: string }>('POST', 'billing_portal/sessions', {
		customer: stripeId(billing.stripe_customer_id, 'cus'),
		return_url: settingsUrl(origin, '?billing=updated'),
		...(configuration ? { configuration } : {})
	});
	return session.url;
}

/** Store the customer's current subscription status (webhook events, returns from Stripe). */
export async function syncCustomer(customer: string) {
	if (!STRIPE_SECRET_KEY) throw new Error('Stripe billing is unavailable');
	await sql.begin(async (tx) => {
		const [owner] = await tx<{ user_id: string }[]>`
			SELECT user_id FROM premium_billing WHERE stripe_customer_id = ${customer}`;
		if (!owner || !(await lockUser(tx, owner.user_id))) return;
		const status = await latestStatus(stripeId(customer, 'cus'));
		await tx`UPDATE premium_billing SET subscription_status = ${status}
			WHERE stripe_customer_id = ${customer}`;
	});
}

/** After Checkout or the portal sends someone back: read Stripe now rather than wait for the webhook. */
export async function refreshPremium(uid: string) {
	if (!STRIPE_SECRET_KEY) return;
	const [billing] = await sql<Pick<Billing, 'stripe_customer_id'>[]>`
		SELECT stripe_customer_id FROM premium_billing WHERE user_id = ${uid}`;
	if (billing) await syncCustomer(billing.stripe_customer_id);
}

/**
 * Ends billing inside the account-deletion transaction, under the same lock as Checkout. Deleting the Stripe customer
 * cancels any subscription at once (no refund for the rest of the period), removes the saved card, and stops an open
 * Checkout from creating a new subscription. Expiring that Checkout first only closes the page. Returns false when
 * billing exists but can't be ended now (no key, Stripe unreachable); the caller then deletes nothing.
 */
export async function closeBilling(tx: TransactionSql, uid: string): Promise<boolean> {
	await lockUser(tx, uid);
	const billing = await billingFor(tx, uid);
	if (!billing) return true;
	if (!STRIPE_SECRET_KEY) return false;
	try {
		if (billing.checkout_session_id)
			await stripe(
				'POST',
				`checkout/sessions/${stripeId(billing.checkout_session_id, 'cs')}/expire`
			).catch(() => {}); // fails unless the session is still open, which is fine
		await stripe('DELETE', `customers/${stripeId(billing.stripe_customer_id, 'cus')}`).catch(
			(e) => {
				// Already gone: an earlier attempt deleted it, then a later step failed and rolled back.
				if (!(e instanceof StripeRequestError && e.code === 'resource_missing')) throw e;
			}
		);
		return true;
	} catch (e) {
		console.error('[Stripe close billing]', e);
		return false;
	}
}

export async function verifyStripeSignature(body: string, header: string) {
	if (!STRIPE_WEBHOOK_SECRET) return false;
	const parts = header.split(',').map((part) => part.trim().split('='));
	const timestamp = parts.find(([key]) => key === 't')?.[1];
	if (
		!timestamp ||
		!/^\d+$/.test(timestamp) ||
		Math.abs(Date.now() / 1000 - Number(timestamp)) > 300
	) {
		return false;
	}
	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey(
		'raw',
		encoder.encode(STRIPE_WEBHOOK_SECRET),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['verify']
	);
	const payload = encoder.encode(`${timestamp}.${body}`);
	for (const [version, signature] of parts) {
		if (version !== 'v1' || !/^[a-f\d]{64}$/i.test(signature)) continue;
		const bytes = Uint8Array.from(signature.match(/../g)!, (pair) => parseInt(pair, 16));
		if (await crypto.subtle.verify('HMAC', key, bytes, payload)) return true;
	}
	return false;
}
