import {
	BETTER_AUTH_URL,
	STRIPE_PRICE_ID,
	STRIPE_SECRET_KEY,
	STRIPE_WEBHOOK_SECRET
} from '$app/env/private';
import type { TransactionSql } from 'postgres';
import { sql } from './db';

type Billing = {
	stripe_customer_id: string;
	checkout_url: string | null;
	checkout_expires_at: Date | null;
	subscription_status: string | null;
};
type Subscription = { id: string; status: string; items: { data: { price: { id: string } }[] } };
const grantsPremium = (status: string | null) => status === 'active' || status === 'trialing';
const blocksCheckout = (status: string | null) =>
	status !== null && status !== 'canceled' && status !== 'incomplete_expired';

export const checkoutConfigured = () =>
	Boolean(STRIPE_SECRET_KEY && STRIPE_PRICE_ID?.startsWith('price_') && STRIPE_WEBHOOK_SECRET);

export class StripeRequestError extends Error {
	constructor(
		readonly status: number,
		readonly code: string | undefined,
		message: string
	) {
		super(message);
	}
}

async function stripe<T>(
	path: string,
	fields?: Record<string, string>,
	idempotencyKey?: string
): Promise<T> {
	const headers = new Headers({
		Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
		'Stripe-Version': '2025-12-15.clover'
	});
	if (idempotencyKey) headers.set('Idempotency-Key', idempotencyKey);
	const response = await fetch(`https://api.stripe.com/v1/${path}`, {
		method: fields ? 'POST' : 'GET',
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
		const operation = path.split('?')[0];
		throw new StripeRequestError(
			response.status,
			code,
			`Stripe ${operation} returned HTTP ${response.status}${details.length ? ` (${details.join(', ')})` : ''}`
		);
	}
	return (await response.json()) as T;
}

async function latestStatus(customer: string): Promise<string | null> {
	const query = new URLSearchParams({ customer, status: 'all', limit: '100' });
	let blocking: string | null = null;
	while (true) {
		const { data, has_more } = await stripe<{ data: Subscription[]; has_more: boolean }>(
			`subscriptions?${query}`
		);
		for (const subscription of data) {
			if (!subscription.items.data.some((item) => item.price.id === STRIPE_PRICE_ID)) continue;
			if (grantsPremium(subscription.status)) return subscription.status;
			if (blocksCheckout(subscription.status)) blocking ??= subscription.status;
		}
		if (!has_more || data.length === 0) return blocking;
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

export async function premiumStatus(uid: string) {
	const [billing] = await sql<Billing[]>`
		SELECT subscription_status FROM premium_billing WHERE user_id = ${uid}`;
	return {
		active: grantsPremium(billing?.subscription_status ?? null),
		manage: Boolean(billing && STRIPE_SECRET_KEY)
	};
}

export async function startCheckout(uid: string, email: string, requestOrigin: string) {
	if (!checkoutConfigured() || !STRIPE_PRICE_ID) throw new Error('Checkout is unavailable');
	const price = STRIPE_PRICE_ID;
	const settings = new URL('/settings', BETTER_AUTH_URL ?? requestOrigin).href;
	return sql.begin(async (tx) => {
		if (!(await lockUser(tx, uid))) throw new Error('Account is unavailable');
		let billing = await billingFor(tx, uid);
		if (!billing) {
			const customer = await stripe<{ id: string }>(
				'customers',
				{ email },
				`explorin-customer-${uid}`
			);
			[billing] = await tx<Billing[]>`
				INSERT INTO premium_billing (user_id, stripe_customer_id)
				VALUES (${uid}, ${customer.id}) RETURNING *`;
		}
		const status = await latestStatus(billing.stripe_customer_id);
		if (blocksCheckout(status)) return null;
		if (billing.checkout_url && Number(billing.checkout_expires_at) > Date.now()) {
			return billing.checkout_url;
		}
		const session = await stripe<{ url: string; expires_at: number }>(
			'checkout/sessions',
			{
				mode: 'subscription',
				customer: billing.stripe_customer_id,
				'line_items[0][price]': price,
				'line_items[0][quantity]': '1',
				success_url: `${settings}?billing=complete`,
				cancel_url: settings
			},
			`explorin-checkout-${uid}-${price}-${Number(billing.checkout_expires_at)}`
		);
		// The attempt key uses the previous expiration so retries reuse the same Stripe session.
		await tx`UPDATE premium_billing
			SET checkout_url = ${session.url}, checkout_expires_at = to_timestamp(${session.expires_at})
			WHERE user_id = ${uid}`;
		return session.url;
	});
}

export async function billingPortal(uid: string, requestOrigin: string) {
	if (!STRIPE_SECRET_KEY) return null;
	const [billing] = await sql<
		Billing[]
	>`SELECT stripe_customer_id FROM premium_billing WHERE user_id = ${uid}`;
	if (!billing) return null;
	const session = await stripe<{ url: string }>('billing_portal/sessions', {
		customer: billing.stripe_customer_id,
		return_url: new URL('/settings', BETTER_AUTH_URL ?? requestOrigin).href
	});
	return session.url;
}

export async function syncSubscription(customer: string) {
	if (!checkoutConfigured()) throw new Error('Stripe billing is unavailable');
	await sql.begin(async (tx) => {
		const [owner] = await tx<{ user_id: string }[]>`
			SELECT user_id FROM premium_billing WHERE stripe_customer_id = ${customer}`;
		if (!owner || !(await lockUser(tx, owner.user_id))) return;
		// Read current Stripe state under the same lock used by Checkout. Replays and out-of-order
		// notifications therefore converge on the current entitlement rather than applying stale snapshots.
		const status = await latestStatus(customer);
		await tx`UPDATE premium_billing SET subscription_status = ${status}
			WHERE stripe_customer_id = ${customer}`;
	});
}

export async function canDeleteBillingAccount(tx: TransactionSql, uid: string) {
	await lockUser(tx, uid);
	const billing = await billingFor(tx, uid);
	if (!billing) return true;
	if (!STRIPE_SECRET_KEY || !STRIPE_PRICE_ID || Number(billing.checkout_expires_at) > Date.now()) {
		return false;
	}
	return !blocksCheckout(await latestStatus(billing.stripe_customer_id));
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
