import postgres, { type Sql } from 'postgres';
import { getRequestEvent } from '$app/server';
import { DATABASE_URL } from '$app/env/private';
import { bindings, onWorkers } from '#bindings';
import type { Place } from '#lib/types';

/**
 * On Workers the connection goes through Hyperdrive (wrangler.jsonc), which keeps a warm pool next to the
 * database so each request's fresh connection is a local handshake instead of a TLS round trip to Tiger Data.
 * Falls back to DATABASE_URL when the binding is absent. Resolved on first use, never at import: the build
 * analyses routes with the bindings unavailable. Hyperdrive's docs suggest `fetch_types: false`, but postgres.js
 * `reserve()` (which Kysely, and so better-auth, uses) never resolves with it off, so types stay on.
 */
function connect(): Sql {
	const hyperdrive = onWorkers
		? (bindings.HYPERDRIVE as { connectionString?: string } | undefined)?.connectionString
		: undefined;
	return postgres(hyperdrive ?? DATABASE_URL, {
		max: onWorkers ? 1 : 5,
		idle_timeout: 20,
		prepare: false
	});
}

/** The dev server's shared pool. On Workers it only serves work that runs outside any request. */
let shared: Sql | undefined;
const sharedSql = () => (shared ??= connect());

/**
 * The connection for the current request. Workers forbid using a socket opened by one request from
 * another, so there each request gets its own single-connection instance, created on first use and
 * closed by hooks.server.ts when the response body finishes. The dev server returns its shared pool.
 */
export function requestSql(): Sql {
	if (!onWorkers) return sharedSql();
	let locals: App.Locals;
	try {
		locals = getRequestEvent().locals;
	} catch {
		return sharedSql(); // not inside a request (build analysis, background work)
	}
	return (locals.sql ??= connect());
}

/** Tagged-template client that always resolves to `requestSql()`; use it like a plain postgres.js `sql`. */
export const sql: Sql = new Proxy((() => {}) as unknown as Sql, {
	// `has` matters too: kysely-postgres-js tells an instance from a factory by `'reserve' in sql`.
	has: (_t, key) => Reflect.has(requestSql(), key),
	get: (_t, key) => Reflect.get(requestSql(), key),
	apply: (_t, thisArg, args) =>
		Reflect.apply(requestSql() as unknown as (...a: unknown[]) => unknown, thisArg, args)
});

export const vec = (v: number[]) => `[${v.join(',')}]`;

export async function ensureUser(uid: string, name?: string | null) {
	await sql`INSERT INTO users (id, name) VALUES (${uid}, ${name ?? null})
	          ON CONFLICT (id) DO UPDATE SET name = COALESCE(EXCLUDED.name, users.name)`;
}

/** The person's taste embedding ("people like you" weighting), or null before onboarding finishes. */
export async function getTasteEmbedding(uid: string): Promise<number[] | null> {
	const [row] = await sql<{ embedding: string | null }[]>`
		SELECT embedding::text AS embedding FROM taste WHERE user_id = ${uid}`;
	return row?.embedding ? JSON.parse(row.embedding) : null;
}

/**
 * The connection hooks.server.ts uses after the response is sent (usage flush): this request's own on Workers,
 * opened if nothing in the request needed one yet, and the shared pool under Node.
 */
export function sqlFor(locals: App.Locals): Sql {
	return onWorkers ? (locals.sql ??= connect()) : sharedSql();
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
