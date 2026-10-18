/**
 * Usage ledger. Upstream wrappers call `track()` / `trackCall()` at the point a billed request actually goes out
 * (cache hits never get here). Events collect on `locals.usage` and hooks.server.ts writes them in one insert
 * after the response body and any `background()` work have finished, so tracking never slows a response.
 * Only signed-in people are tracked; build analysis and scripts have no request and are skipped.
 */
import { getRequestEvent } from '$app/server';
import { MONTHLY_CREDITS } from '$app/env/private';
import type { Sql } from 'postgres';
import {
	EMBED_PER_M,
	GEMINI_INPUT_PER_M,
	GEMINI_OUTPUT_PER_M,
	MICROS_PER_CREDIT,
	PER_CALL,
	type PricedCall
} from './pricing';

export interface UsageEvent {
	service: string;
	operation: string;
	units: number;
	cost_micros: number;
}

export function track(service: string, operation: string, units: number, costMicros: number) {
	let locals: App.Locals;
	try {
		locals = getRequestEvent().locals;
	} catch {
		return; // outside a request
	}
	if (!locals.user) return;
	(locals.usage ??= []).push({
		service,
		operation,
		units: Math.max(0, Math.round(units)),
		cost_micros: Math.max(0, Math.round(costMicros))
	});
}

/** A flat-priced call such as one Places Text Search; `operation` says what it was for. */
export const trackCall = (call: PricedCall, operation: string = call) =>
	track(call.split('.')[0], operation, 1, PER_CALL[call]);

/** A Gemini generation, from the response's usageMetadata. */
export function trackGemini(
	operation: string,
	usage:
		| { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number }
		| undefined
) {
	const input = usage?.promptTokenCount ?? 0;
	const output = (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0);
	track(
		'gemini',
		operation,
		input + output,
		(input * GEMINI_INPUT_PER_M + output * GEMINI_OUTPUT_PER_M) / 1_000_000
	);
}

/** An embedding call; the API reports no token count, so it is estimated at ~4 characters per token. */
export function trackEmbedding(operation: string, text: string) {
	const tokens = Math.ceil(text.length / 4);
	track('embedding', operation, tokens, (tokens * EMBED_PER_M) / 1_000_000);
}

/** Write and clear the request's pending events. Called by hooks.server.ts with the request's own connection. */
export async function flushUsage(locals: App.Locals, sql: Sql): Promise<void> {
	const pending = locals.usage?.splice(0) ?? [];
	if (!pending.length || !locals.user) return;
	const userId = locals.user.id;
	try {
		await sql`INSERT INTO usage_events ${sql(pending.map((e) => ({ ...e, user_id: userId })))}`;
	} catch (e) {
		console.warn('[usage] could not record', pending.length, 'events:', (e as Error).message);
	}
}

export const monthlyCredits = () => MONTHLY_CREDITS;
export const toCredits = (micros: number) => micros / MICROS_PER_CREDIT;
