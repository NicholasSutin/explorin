/**
 * Trips and their stops. Every query is scoped to the owner (`user_id = uid`), so a guessed id is a 404.
 *
 * Google content rules (see places.ts): a stop row stores the place id plus Explorin's own text. Coordinates
 * are kept with `coords_at` and refreshed by place id once they are older than 25 days (Google allows 30);
 * photos are looked up by place id each time a trip is shown and never written to the database. Stops someone
 * added from the map store only the place id; their name and address come from Places each time (placeCard).
 */
import { error } from '@sveltejs/kit';
import type {
	DayWindow,
	Experience,
	Happening,
	LatLng,
	Stop,
	Trip,
	TripStatus
} from '#lib/adventure';
import { sql } from './db';
import { placeBasics, placeCard, type PlaceCard } from './places';

/** Explorin's own copy of a stop, stored as `trip_stops.data`. */
interface StopData {
	title: string;
	place: string;
	description: string;
	reason: string;
	category: string;
	tags: string[];
	url?: string;
	voices?: Stop['voices'];
}

interface TripRow {
	id: string;
	prompt: string;
	city: string;
	day_window: DayWindow;
	title: string | null;
	status: TripStatus;
	happenings: Happening[];
	note: string | null;
	photo_urls: string[];
	best_for: string[];
	best_for_options: string[];
	story_title: string | null;
	story: string | null;
	emotions: string[];
	highlight_stop_id: string | null;
	created_at: Date;
	started_at: Date | null;
	finished_at: Date | null;
}

interface StopRow {
	id: string;
	trip_id: string;
	position: number;
	google_place_id: string | null;
	data: StopData;
	lat: number | null;
	lng: number | null;
	coords_at: Date | null;
	in_plan: boolean;
	added_by: 'ai' | 'user';
	visited_at: Date | null;
	visited_lat: number | null;
	visited_lng: number | null;
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);
/** Google Maps page for a place id: built, not stored (https://developers.google.com/maps/documentation/urls). */
const mapsLink = (placeId: string, name: string) =>
	`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name || 'place')}&query_place_id=${encodeURIComponent(placeId)}`;
const STALE_MS = 25 * 24 * 3600_000;

function toStop(r: StopRow): Stop {
	return {
		id: r.id,
		position: r.position,
		placeId: r.google_place_id ?? undefined,
		title: r.data.title,
		place: r.data.place,
		description: r.data.description,
		reason: r.data.reason,
		category: r.data.category,
		tags: r.data.tags ?? [],
		url: r.data.url,
		mapsUrl: r.google_place_id ? mapsLink(r.google_place_id, r.data.place) : undefined,
		voices: r.data.voices,
		coords: r.lat != null && r.lng != null ? { lat: r.lat, lng: r.lng } : undefined,
		inPlan: r.in_plan,
		addedBy: r.added_by,
		visitedAt: iso(r.visited_at),
		visitedFrom:
			r.visited_lat != null && r.visited_lng != null
				? { lat: r.visited_lat, lng: r.visited_lng }
				: null
	};
}

function toTrip(r: TripRow, stops: Stop[]): Trip {
	return {
		id: r.id,
		prompt: r.prompt,
		city: r.city,
		window: r.day_window,
		title: r.title,
		status: r.status,
		happenings: r.happenings ?? [],
		note: r.note,
		photoUrls: r.photo_urls,
		bestFor: r.best_for,
		bestForOptions: r.best_for_options,
		storyTitle: r.story_title,
		story: r.story,
		emotions: r.emotions,
		highlightStopId: r.highlight_stop_id,
		createdAt: r.created_at.toISOString(),
		startedAt: iso(r.started_at),
		finishedAt: iso(r.finished_at),
		stops
	};
}

export async function createTrip(
	uid: string,
	t: {
		prompt: string;
		city: string;
		window: DayWindow;
		title: string;
		happenings: Happening[];
		stops: Experience[];
	}
): Promise<string> {
	return sql.begin(async (tx) => {
		const [trip] = await tx<{ id: string }[]>`
			INSERT INTO trips (user_id, prompt, city, day_window, title, happenings)
			VALUES (${uid}, ${t.prompt}, ${t.city}, ${t.window}, ${t.title}, ${tx.json(t.happenings as never)})
			RETURNING id`;
		if (t.stops.length)
			await tx`INSERT INTO trip_stops ${tx(
				t.stops.map((e, i) => ({
					trip_id: trip.id,
					position: i,
					google_place_id: e.placeId ?? null,
					data: tx.json({
						title: e.title,
						place: e.place,
						description: e.description,
						reason: e.reason,
						category: e.category,
						tags: e.tags ?? [],
						url: e.url,
						voices: e.voices
					} satisfies StopData as never),
					lat: e.coords?.lat ?? null,
					lng: e.coords?.lng ?? null,
					coords_at: e.coords ? new Date() : null
				}))
			)}`;
		return trip.id;
	});
}

/**
 * One trip with its stops. `photos` looks each stop up by place id (Essentials SKU, cached a day) for the photo
 * and fresh coordinates; without it only stale coordinates are refreshed. Throws 404 for someone else's trip.
 */
export async function getTrip(uid: string, id: string, { photos = false } = {}): Promise<Trip> {
	if (!/^[0-9a-f-]{36}$/i.test(id)) error(404, 'Trip not found');
	const [row] = await sql<TripRow[]>`SELECT * FROM trips WHERE id = ${id} AND user_id = ${uid}`;
	if (!row) error(404, 'Trip not found');
	const rows = await sql<
		StopRow[]
	>`SELECT * FROM trip_stops WHERE trip_id = ${id} ORDER BY position`;
	// Quotes are copied into the stops when the day is planned. Show only those still shared, so a deleted account,
	// trip or quote disappears from everyone's trips too.
	const voiceIds = [...new Set(rows.flatMap((r) => r.data.voices?.map((v) => v.id) ?? []))];
	const shared = voiceIds.length
		? new Set(
				(
					await sql<{ id: string }[]>`
						SELECT id::text FROM reflections WHERE id::text = ANY(${voiceIds}::text[]) AND consent_share`
				).map((r) => r.id)
			)
		: null;
	const stops = await Promise.all(
		rows.map(async (r) => {
			const stop = toStop(r);
			if (shared && stop.voices) {
				const voices = stop.voices.filter((v) => shared.has(v.id));
				stop.voices = voices.length ? voices : undefined;
			}
			if (r.added_by === 'user' && r.google_place_id) return withCard(stop, r.google_place_id);
			const stale = !r.coords_at || Date.now() - r.coords_at.getTime() > STALE_MS;
			if (!r.google_place_id || (!photos && !stale)) return stop;
			const basics = await placeBasics(r.google_place_id);
			if (basics?.coords && stale) {
				stop.coords = basics.coords;
				await sql`UPDATE trip_stops SET lat = ${basics.coords.lat}, lng = ${basics.coords.lng}, coords_at = now()
				          WHERE id = ${r.id}`;
			}
			if (photos && basics?.photo) stop.photo = basics.photo;
			return stop;
		})
	);
	return toTrip(row, stops);
}

/** Name, kind, address, photo and position of a map-added stop, from Places (never stored). */
async function withCard(stop: Stop, placeId: string): Promise<Stop> {
	const card = await placeCard(placeId);
	if (!card)
		return { ...stop, title: stop.title || 'Saved place', place: stop.place || 'Saved place' };
	return {
		...stop,
		title: card.name,
		place: card.name,
		category: card.kind ?? stop.category,
		description: card.address ?? '',
		coords: card.coords ?? stop.coords,
		photo: card.photo,
		mapsUrl: card.mapsUrl ?? stop.mapsUrl
	};
}

export interface TripSummary {
	id: string;
	title: string | null;
	storyTitle: string | null;
	city: string;
	status: TripStatus;
	createdAt: string;
	finishedAt: string | null;
	stops: number;
	visited: number;
	cover: string | null;
}

export async function listTrips(uid: string, limit = 50): Promise<TripSummary[]> {
	const rows = await sql<
		{
			id: string;
			title: string | null;
			story_title: string | null;
			city: string;
			status: TripStatus;
			created_at: Date;
			finished_at: Date | null;
			stops: number;
			visited: number;
			cover: string | null;
		}[]
	>`SELECT t.id, t.title, t.story_title, t.city, t.status, t.created_at, t.finished_at, t.photo_urls[1] AS cover,
	         count(s.id) FILTER (WHERE s.in_plan)::int AS stops,
	         count(s.visited_at)::int AS visited
	  FROM trips t LEFT JOIN trip_stops s ON s.trip_id = t.id
	  WHERE t.user_id = ${uid}
	  GROUP BY t.id ORDER BY t.created_at DESC LIMIT ${limit}`;
	return rows.map((r) => ({
		id: r.id,
		title: r.title,
		storyTitle: r.story_title,
		city: r.city,
		status: r.status,
		createdAt: r.created_at.toISOString(),
		finishedAt: iso(r.finished_at),
		stops: r.stops,
		visited: r.visited,
		cover: r.cover
	}));
}

/** Finished trips, oldest first, for the scrapbook. Coordinates are refreshed when stale; no Google photos. */
export async function scrapbookTrips(uid: string): Promise<Trip[]> {
	const ids = await sql<{ id: string }[]>`
		SELECT id FROM trips WHERE user_id = ${uid} AND status = 'finished' ORDER BY finished_at ASC`;
	return Promise.all(ids.map((r) => getTrip(uid, r.id)));
}

async function ownStop(uid: string, tripId: string, stopId: string) {
	const [row] = await sql<{ id: string }[]>`
		SELECT s.id FROM trip_stops s JOIN trips t ON t.id = s.trip_id
		WHERE s.id = ${stopId} AND t.id = ${tripId} AND t.user_id = ${uid}`;
	if (!row) error(404, 'Stop not found');
}

/** Check in (with the person's own position when shared), undo a check-in, or add/remove a stop from the day. */
export async function updateStop(
	uid: string,
	tripId: string,
	stopId: string,
	patch: { inPlan?: boolean; visited?: boolean; at?: LatLng | null }
) {
	await ownStop(uid, tripId, stopId);
	if (patch.inPlan !== undefined)
		await sql`UPDATE trip_stops SET in_plan = ${patch.inPlan} WHERE id = ${stopId}`;
	if (patch.visited === true) {
		await sql`UPDATE trip_stops SET visited_at = COALESCE(visited_at, now()),
		            visited_lat = ${patch.at?.lat ?? null}, visited_lng = ${patch.at?.lng ?? null}, in_plan = true
		          WHERE id = ${stopId}`;
		await sql`UPDATE trips SET status = 'active', started_at = COALESCE(started_at, now())
		          WHERE id = ${tripId} AND status = 'planned'`;
	} else if (patch.visited === false)
		await sql`UPDATE trip_stops SET visited_at = NULL, visited_lat = NULL, visited_lng = NULL WHERE id = ${stopId}`;
}

/** A landmark the person tapped on the map and added to their day. */
export async function addStop(uid: string, tripId: string, card: PlaceCard): Promise<Stop> {
	const [trip] = await sql<
		{ id: string }[]
	>`SELECT id FROM trips WHERE id = ${tripId} AND user_id = ${uid}`;
	if (!trip) error(404, 'Trip not found');
	const [existing] = await sql<StopRow[]>`
		SELECT * FROM trip_stops WHERE trip_id = ${tripId} AND google_place_id = ${card.placeId}`;
	if (existing) {
		await sql`UPDATE trip_stops SET in_plan = true WHERE id = ${existing.id}`;
		return { ...toStop(existing), inPlan: true, photo: card.photo };
	}
	// Name and address are Places content, so only the id (and 30-day coordinates) are stored.
	const data: StopData = {
		title: '',
		place: '',
		description: '',
		reason: 'You added this from the map.',
		category: 'Landmark',
		tags: []
	};
	const [row] = await sql<StopRow[]>`
		INSERT INTO trip_stops (trip_id, position, google_place_id, data, lat, lng, coords_at, added_by)
		VALUES (${tripId}, (SELECT COALESCE(max(position) + 1, 0) FROM trip_stops WHERE trip_id = ${tripId}),
		        ${card.placeId}, ${sql.json(data as never)}, ${card.coords?.lat ?? null}, ${card.coords?.lng ?? null},
		        ${card.coords ? new Date() : null}, 'user')
		RETURNING *`;
	return withCard(toStop(row), card.placeId);
}

export async function deleteTrip(uid: string, tripId: string) {
	await sql`DELETE FROM trips WHERE id = ${tripId} AND user_id = ${uid}`;
}

/** The latest trip still in progress, for the home screen's "continue" card. */
export async function currentTrip(uid: string): Promise<TripSummary | null> {
	const trips = await listTrips(uid, 5);
	return trips.find((t) => t.status !== 'finished') ?? null;
}
