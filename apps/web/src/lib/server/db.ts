import postgres, { type Sql } from 'postgres';
import { getRequestEvent } from '$app/server';
import { DATABASE_URL } from '$app/env/private';
import { onWorkers } from '#bindings';
import type { Place, Profile, Traits } from '#lib/types';

const options = { max: onWorkers ? 1 : 5, idle_timeout: 20, prepare: false } as const;

/** One shared pool on Node. On Workers it only serves work that runs outside any request. */
const shared: Sql = postgres(DATABASE_URL, options);

/**
 * The connection for the current request. Workers forbid using a socket opened by one request from
 * another, so there each request gets its own single-connection instance, created on first use and
 * closed by hooks.server.ts when the response body finishes. On Node the shared pool is returned.
 */
export function requestSql(): Sql {
	if (!onWorkers) return shared;
	let locals: App.Locals;
	try {
		locals = getRequestEvent().locals;
	} catch {
		return shared; // not inside a request (build analysis, background work)
	}
	return (locals.sql ??= postgres(DATABASE_URL, options));
}

/** Tagged-template client that always resolves to `requestSql()`; use it like a plain postgres.js `sql`. */
export const sql: Sql = new Proxy(shared, {
	get: (_t, key) => Reflect.get(requestSql(), key),
	apply: (_t, thisArg, args) =>
		Reflect.apply(requestSql() as unknown as (...a: unknown[]) => unknown, thisArg, args)
});

export const vec = (v: number[]) => `[${v.join(',')}]`;

export async function ensureUser(uid: string, name?: string | null) {
	await sql`INSERT INTO users (id, name) VALUES (${uid}, ${name ?? null})
	          ON CONFLICT (id) DO UPDATE SET name = COALESCE(EXCLUDED.name, users.name)`;
}

export async function getProfile(uid: string): Promise<Profile | null> {
	const rows = await sql<Profile[]>`
		SELECT p.user_id, u.name, p.traits, p.summary, p.updated_at
		FROM profiles p JOIN users u ON u.id = p.user_id WHERE p.user_id = ${uid}`;
	return rows[0] ?? null;
}

export type ProfileWithEmbedding = Profile & { embedding: number[] | null };

/** Profile plus its vector in one round trip, for the paths that need both. */
export async function getProfileWithEmbedding(uid: string): Promise<ProfileWithEmbedding | null> {
	const rows = await sql<(Profile & { embedding: string | null })[]>`
		SELECT p.user_id, u.name, p.traits, p.summary, p.updated_at, p.embedding::text AS embedding
		FROM profiles p JOIN users u ON u.id = p.user_id WHERE p.user_id = ${uid}`;
	const row = rows[0];
	return row ? { ...row, embedding: row.embedding ? JSON.parse(row.embedding) : null } : null;
}

export async function upsertProfile(uid: string, traits: Traits, embedding: number[]) {
	await sql`INSERT INTO profiles (user_id, traits, summary, embedding, updated_at)
	          VALUES (${uid}, ${sql.json(traits as never)}, ${traits.summary}, ${vec(embedding)}::vector, now())
	          ON CONFLICT (user_id) DO UPDATE SET traits = EXCLUDED.traits, summary = EXCLUDED.summary,
	            embedding = EXCLUDED.embedding, updated_at = now()`;
}

/** Upsert a Maps-grounded place by google_place_id. Returns the row. */
export async function upsertGroundedPlace(p: {
	placeId: string;
	title: string;
	uri: string;
}): Promise<Place> {
	const existing = await sql<
		Place[]
	>`SELECT * FROM places WHERE google_place_id = ${p.placeId} OR name = ${p.title} LIMIT 1`;
	if (existing[0]) {
		if (!existing[0].google_place_id)
			await sql`UPDATE places SET google_place_id = ${p.placeId}, maps_url = COALESCE(maps_url, ${p.uri}) WHERE id = ${existing[0].id}`;
		return existing[0];
	}
	// Another request (or the background Maps enrichment) may insert the same name first: merge instead of failing.
	const rows = await sql<Place[]>`
		INSERT INTO places (google_place_id, name, maps_url, tags) VALUES (${p.placeId}, ${p.title}, ${p.uri}, '{}')
		ON CONFLICT (name) DO UPDATE SET google_place_id = COALESCE(places.google_place_id, EXCLUDED.google_place_id),
		                                 maps_url = COALESCE(places.maps_url, EXCLUDED.maps_url)
		RETURNING *`;
	return rows[0];
}
