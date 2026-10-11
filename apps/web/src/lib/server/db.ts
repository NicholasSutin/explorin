import postgres from 'postgres';
import { DATABASE_URL } from '$app/env/private';
import type { Place, Profile, Traits } from '#lib/types';

export const sql = postgres(DATABASE_URL, { max: 5, idle_timeout: 20, prepare: false });

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
	const rows = await sql<Place[]>`
		INSERT INTO places (google_place_id, name, maps_url, tags) VALUES (${p.placeId}, ${p.title}, ${p.uri}, '{}') RETURNING *`;
	return rows[0];
}
