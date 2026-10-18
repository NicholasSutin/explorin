/**
 * Account-level operations for settings: profile edits, password change, usage summary and full deletion.
 * Deletion removes everything the person created: photos in storage, trips and stops, taste, usage, their
 * reflections (shared quotes included, also the copies planned into other people's trips), legacy experiences
 * and profiles, the app's users row, and finally the better-auth user (sessions and accounts cascade from it).
 */
import { auth } from './auth';
import { sql } from './db';
import { deletePhotos } from '#storage';
import { MICROS_PER_CREDIT } from './pricing';
import { monthlyCredits } from './usage';

export async function updateAccount(userId: string, data: { name: string; homeCity: string }) {
	const ctx = await auth.$context;
	await ctx.internalAdapter.updateUser(userId, { name: data.name, homeCity: data.homeCity });
	await sql`UPDATE users SET name = ${data.name} WHERE id = ${userId}`;
}

/** Change the password; better-auth checks the current one. Other sessions are signed out. */
export async function changePassword(
	headers: Headers,
	currentPassword: string,
	newPassword: string
) {
	await auth.api.changePassword({
		headers,
		body: { currentPassword, newPassword, revokeOtherSessions: true }
	});
}

export interface UsageSummary {
	creditsUsed: number;
	creditsLimit: number;
	/** Estimated USD at list prices, this calendar month. */
	costUsd: number;
	byService: { service: string; calls: number; credits: number }[];
	byDay: { day: string; credits: number }[];
	resetsOn: string;
}

export async function usageSummary(userId: string): Promise<UsageSummary> {
	const [services, days] = await Promise.all([
		sql<{ service: string; calls: number; micros: string }[]>`
			SELECT service, count(*)::int AS calls, sum(cost_micros)::text AS micros
			FROM usage_events WHERE user_id = ${userId} AND created_at >= date_trunc('month', now())
			GROUP BY service ORDER BY sum(cost_micros) DESC`,
		sql<{ day: string; micros: string }[]>`
			SELECT to_char(d, 'YYYY-MM-DD') AS day, COALESCE(sum(u.cost_micros), 0)::text AS micros
			FROM generate_series(date_trunc('day', now()) - interval '29 days', date_trunc('day', now()), interval '1 day') d
			LEFT JOIN usage_events u ON u.user_id = ${userId} AND date_trunc('day', u.created_at) = d
			GROUP BY d ORDER BY d`
	]);
	const total = services.reduce((m, s) => m + Number(s.micros), 0);
	const next = new Date();
	next.setUTCMonth(next.getUTCMonth() + 1, 1);
	return {
		creditsUsed: total / MICROS_PER_CREDIT,
		creditsLimit: monthlyCredits(),
		costUsd: total / 1e6,
		byService: services.map((s) => ({
			service: s.service,
			calls: s.calls,
			credits: Number(s.micros) / MICROS_PER_CREDIT
		})),
		byDay: days.map((d) => ({ day: d.day, credits: Number(d.micros) / MICROS_PER_CREDIT })),
		resetsOn: next.toISOString().slice(0, 10)
	};
}

/** Credits spent this calendar month; the planner refuses new plans past MONTHLY_CREDITS. */
export async function creditsThisMonth(userId: string): Promise<number> {
	const [row] = await sql<{ micros: string | null }[]>`
		SELECT sum(cost_micros)::text AS micros FROM usage_events
		WHERE user_id = ${userId} AND created_at >= date_trunc('month', now())`;
	return Number(row?.micros ?? 0) / MICROS_PER_CREDIT;
}

/** Everything, irreversibly. Storage first: if it fails, nothing in the database is gone yet and a retry works. */
export async function deleteAccount(userId: string): Promise<{ photos: number }> {
	const photos = await deletePhotos(userId);
	await sql.begin(async (tx) => {
		const quotes = await tx<{ id: string }[]>`
			DELETE FROM reflections WHERE author_id = ${userId}
			OR experience_id IN (SELECT id FROM experiences WHERE user_id = ${userId}) RETURNING id::text`;
		// Planning copies matched quotes into each stop (trip_stops.data.voices); remove theirs from everyone's trips.
		const ids = quotes.map((q) => q.id);
		if (ids.length)
			await tx`
				UPDATE trip_stops SET data = jsonb_set(data, '{voices}', COALESCE(
				  (SELECT jsonb_agg(v) FROM jsonb_array_elements(data->'voices') v WHERE NOT (v->>'id' = ANY(${ids}::text[]))),
				  '[]'::jsonb))
				WHERE jsonb_typeof(data->'voices') = 'array'
				  AND EXISTS (SELECT 1 FROM jsonb_array_elements(data->'voices') v WHERE v->>'id' = ANY(${ids}::text[]))`;
		await tx`DELETE FROM experiences WHERE user_id = ${userId}`;
		await tx`DELETE FROM trips WHERE user_id = ${userId}`;
		await tx`DELETE FROM usage_events WHERE user_id = ${userId}`;
		await tx`DELETE FROM taste WHERE user_id = ${userId}`;
		await tx`DELETE FROM profiles WHERE user_id = ${userId}`;
		const [u] = await tx<
			{ email: string }[]
		>`DELETE FROM "user" WHERE id = ${userId} RETURNING email`;
		// Pending sign-up links and resets: magic-link rows keep {"email": …} as JSON in `value`, reset rows the user id.
		if (u)
			await tx`DELETE FROM verification
			         WHERE identifier = ${u.email} OR value = ${userId}
			            OR CASE WHEN pg_input_is_valid(value, 'jsonb') THEN lower(value::jsonb->>'email') END = lower(${u.email})`;
		await tx`DELETE FROM users WHERE id = ${userId}`;
	});
	return { photos };
}
