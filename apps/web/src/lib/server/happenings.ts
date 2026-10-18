/**
 * Happenings: public events near a trip's stops, from NYC Open Data's "NYC Permitted Event Information"
 * (dataset tvpp-9vvx, free and keyless, updated daily by the Street Activity Permit Office). It lists every
 * permitted event, so most rows are private field bookings ("Sport - Youth", "Party"); only public-facing
 * types with real names are kept. Locations are text, so they are geocoded (geocode.ts) and kept when within
 * walking distance of a stop. NYC only; other cities get none.
 */
import type { DayWindow, Happening, LatLng } from '#lib/adventure';
import { distanceM } from '#lib/geo';
import { fetchJson } from './http';
import { geocodeAll, type GeoQuery } from './geocode';

const DATASET = 'https://data.cityofnewyork.us/resource/tvpp-9vvx.json';

const PUBLIC_TYPES = [
	'Farmers Market',
	'Street Festival',
	'Single Block Festival',
	'BID Multi-Block',
	'Street Event',
	'Plaza Event',
	'Plaza Partner Event',
	'Open Street Partner Event',
	'Parade',
	'Athletic Race / Tour',
	'Sidewalk Sale',
	'Special Event'
];

/** Permit names that describe a private gathering rather than something a passer-by can join. */
const PRIVATE_NAME =
	/^(party|celebration|wedding|picnic|ceremony|protest|birthday( party)?|meeting|rally|vigil|memorial|gathering|bbq|barbecue|reunion|baby shower|graduation|photo ?shoot|film(ing)?|press conference|private event|event|special event|family day|family gathering|church event|block party|demonstration|game|practice|tournament|league)s?$/i;

/** Permits that close something rather than put on something. */
const NOT_AN_EVENT =
	/\b(closure|closed|closing|maintenance|construction|repair|restoration|renovation|staging|load[- ]?(in|out)|set ?up|rehearsal|filming|shoot|permit|lawn|turf|field use|reserved)\b/i;
/** "Special Event" covers private bookings too; keep only ones that sound like something you can drop in on. */
const PUBLIC_WORDS =
	/\b(festival|fest|fair|market|bazaar|concert|music|jazz|band|dance|parade|performance|show|theater|theatre|film screening|screening|movie|art|craft|exhibit|exhibition|tour|walk|run|race|5k|10k|yoga|fitness|family day|block party|celebration|heritage|cultural|day|night|open house|holiday|harvest|halloween|pumpkin|flea|book|poetry|comedy|drag|pride|tasting|food)\b/i;

export const isNyc = (city: string) =>
	/\b(new york|nyc|manhattan|brooklyn|queens|bronx|staten island)\b/i.test(city);

/** Rough borough boxes, only to skip geocoding events across the city from every stop. */
const BOROUGHS: Record<string, [number, number, number, number]> = {
	Manhattan: [40.698, 40.882, -74.02, -73.907],
	Brooklyn: [40.57, 40.739, -74.042, -73.833],
	Queens: [40.541, 40.801, -73.962, -73.7],
	Bronx: [40.785, 40.917, -73.933, -73.765],
	'Staten Island': [40.496, 40.649, -74.255, -74.052]
};
const boroughsFor = (points: LatLng[]) =>
	Object.entries(BOROUGHS)
		.filter(([, [s, n, w, e]]) =>
			points.some((p) => p.lat >= s && p.lat <= n && p.lng >= w && p.lng <= e)
		)
		.map(([b]) => b);

/** Local New York wall-clock time as "YYYY-MM-DDTHH:MM:SS", the dataset's own floating format. */
function nycLocal(d: Date): string {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone: 'America/New_York',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hourCycle: 'h23'
	}).formatToParts(d);
	const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
	return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`;
}

/**
 * The [start, end) of the planned window in NYC local time: today, or tomorrow once today's window is over
 * ("afternoon" asked at 9pm means tomorrow afternoon). "now" is the next four hours.
 */
export function windowRange(w: DayWindow, now = new Date()): [string, string] {
	const local = nycLocal(now);
	const hours: Record<Exclude<DayWindow, 'now'>, [number, number]> = {
		morning: [8, 12],
		afternoon: [12, 17],
		evening: [17, 23],
		all_day: [8, 23]
	};
	if (w === 'now') return [local, nycLocal(new Date(now.getTime() + 4 * 3600_000))];
	const [a, b] = hours[w];
	const at = (day: string, h: number) => `${day}T${String(h).padStart(2, '0')}:00:00`;
	let day = local.slice(0, 10);
	if (local >= at(day, b)) day = nycLocal(new Date(now.getTime() + 24 * 3600_000)).slice(0, 10);
	const start = at(day, a);
	const end = at(day, b);
	return [local > start && local < end ? local : start, end];
}

interface Row {
	event_id: string;
	event_name: string;
	event_type: string;
	event_borough: string;
	event_location: string;
	start_date_time: string;
	end_date_time: string;
}

const tidy = (s: string) =>
	s
		.replace(/\s+/g, ' ')
		.replace(/\s+,/g, ',')
		.trim()
		.toLowerCase()
		.replace(/\b([a-z])/g, (m) => m.toUpperCase());

/** "Central Park: Summit Rock" -> place query; "A STREET between B and C, ..." -> intersection of A and B. */
function geoQuery(location: string, borough: string): GeoQuery | null {
	const first = location.split(/,\s{1,2}(?=[A-Z0-9])/)[0].trim();
	const between = first.match(/^(.+?)\s+between\s+(.+?)\s+and\s+(.+)$/i);
	if (between) {
		const cross = between[2].trim();
		if (/dead end/i.test(cross)) return null;
		return { text: `${tidy(between[1])} & ${tidy(cross)}, ${borough}, NY`, kind: 'intersection' };
	}
	const place = first.split(':')[0].trim();
	return place.length >= 3 ? { text: `${tidy(place)}, ${borough}`, kind: 'place' } : null;
}

/**
 * Up to `limit` public events overlapping the trip window and within `radiusM` of any stop, nearest first.
 * Never throws; an empty list when the city is not NYC, the dataset is down or nothing is close.
 */
export async function findHappenings(
	city: string,
	stops: LatLng[],
	window: DayWindow,
	{ radiusM = 1200, limit = 10 }: { radiusM?: number; limit?: number } = {}
): Promise<Happening[]> {
	if (!isNyc(city) || !stops.length) return [];
	const boroughs = boroughsFor(stops);
	if (!boroughs.length) return [];
	const [from, to] = windowRange(window);
	const list = (xs: string[]) => xs.map((x) => `'${x.replace(/'/g, "''")}'`).join(',');
	const where =
		`start_date_time < '${to}' AND end_date_time > '${from}'` +
		` AND event_type in (${list(PUBLIC_TYPES)}) AND event_borough in (${list(boroughs)})`;
	const rows = await fetchJson<Row[]>(
		`${DATASET}?$limit=500&$where=${encodeURIComponent(where)}`,
		{ headers: { Accept: 'application/json' } },
		6000
	);
	if (!rows?.length) return [];

	const seen = new Set<string>();
	const candidates = rows.flatMap((r) => {
		const name = r.event_name?.trim();
		if (!name || PRIVATE_NAME.test(name) || NOT_AN_EVENT.test(name) || name.length < 6) return [];
		if (r.event_type === 'Special Event' && !PUBLIC_WORDS.test(name)) return [];
		// Round-the-clock permits are almost always closures or set-ups, not something to visit.
		const hours = (Date.parse(r.end_date_time) - Date.parse(r.start_date_time)) / 3_600_000;
		if (hours >= 20 && !/Market|Festival/.test(r.event_type)) return [];
		const key = `${name.toLowerCase()}|${r.event_location}`;
		if (seen.has(key)) return [];
		seen.add(key);
		const q = geoQuery(r.event_location ?? '', r.event_borough);
		return q ? [{ r, q }] : [];
	});
	// Named places first (free to geocode, and usually the nicer events), then street segments.
	candidates.sort(
		(a, b) => Number(a.q.kind === 'intersection') - Number(b.q.kind === 'intersection')
	);
	const coords = await geocodeAll(candidates.map((c) => c.q));

	return candidates
		.flatMap(({ r, q }) => {
			const at = coords.get(q.text);
			if (!at) return [];
			const distances = stops.map((s) => distanceM(s, at));
			const nearest = Math.min(...distances);
			if (nearest > radiusM) return [];
			return [
				{
					id: `nyc-${r.event_id}`,
					name: r.event_name.trim(),
					kind: r.event_type,
					starts: r.start_date_time,
					ends: r.end_date_time,
					where: tidy(r.event_location.split(/,\s{1,2}(?=[A-Z0-9])/)[0]),
					lat: at.lat,
					lng: at.lng,
					nearStop: distances.indexOf(nearest),
					distanceM: Math.round(nearest)
				} satisfies Happening
			];
		})
		.sort((a, b) => a.distanceM! - b.distanceM!)
		.slice(0, limit);
}
