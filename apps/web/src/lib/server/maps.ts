/**
 * Google Maps Static API proxy with Explorin-styled maps.
 *
 * Billing (Oct 2026): Static Maps is $2 / 1k after 10k free per month. Every rendered
 * image is cached in memory (keyed by its request), so repeated views of the same card,
 * banner or scrapbook pay once per server process. The API key never leaves the server:
 * the browser only ever sees /api/map?... URLs, which also makes the images same-origin
 * and therefore safe to include in the html-to-image scrapbook export.
 *
 * Styling: Static Maps accepts the classic JSON style language as `style=` query params
 * (feature|element|rules); every image uses the `PAPER` look, the same one the live trip map draws.
 */
import { GOOGLE_MAPS_API_KEY } from '$app/env/private';
import { formatLatLng as fmt, type LatLng } from '#lib/adventure';
import { DAY, timedFetch, ttlCache } from './http';
import { trackCall } from './usage';

/* Brand palette from packages/brand/README.md */
const INK = '0x203d32';
const CREAM = '0xf8f6ef';
const ORANGE = '0xd96738';

/** Warm field-notes look: cream paper, moss parks, muted water, quiet labels. */
const PAPER = [
	`feature:all|element:geometry|color:0xf3f1e6`,
	`feature:all|element:labels.text.fill|color:${INK}`,
	`feature:all|element:labels.text.stroke|color:${CREAM}|weight:2`,
	`feature:all|element:labels.icon|visibility:off`,
	`feature:administrative|element:geometry.stroke|color:0xcfd6c6`,
	`feature:administrative.land_parcel|visibility:off`,
	`feature:administrative.neighborhood|element:labels.text.fill|color:0x6e7c6f`,
	`feature:landscape.natural|element:geometry|color:0xeeeedf`,
	`feature:landscape.man_made|element:geometry|color:0xf3f1e6`,
	`feature:poi|element:labels|visibility:off`,
	`feature:poi|element:geometry|color:0xe9ecdc`,
	`feature:poi.park|element:geometry|color:0xd7e1c4`,
	`feature:poi.park|element:labels.text|visibility:on`,
	`feature:poi.park|element:labels.text.fill|color:0x4f6f52`,
	`feature:road|element:geometry.fill|color:0xffffff`,
	`feature:road|element:geometry.stroke|color:0xe1dfd0`,
	`feature:road|element:labels.text.fill|color:0x6a7566`,
	`feature:road.arterial|element:geometry.fill|color:0xfdfbf3`,
	`feature:road.highway|element:geometry.fill|color:0xf0e5c8`,
	`feature:road.highway|element:geometry.stroke|color:0xdccfa8`,
	`feature:road.highway|element:labels|visibility:off`,
	`feature:transit|visibility:off`,
	`feature:water|element:geometry|color:0xc4d5d0`,
	`feature:water|element:labels.text.fill|color:0x5f7a74`
];

export interface MapRequest {
	/** Centre + zoom for a single place; omit both and pass `pins` for an auto-fitted overview. */
	center?: LatLng;
	zoom?: number;
	pins: LatLng[];
	width: number;
	height: number;
	/** Number the pins 1..9 (Static Maps labels are a single character). */
	numbered?: boolean;
	/** Draw a path through the pins in order (history "trail"). */
	trail?: boolean;
}

/** Build the upstream Static Maps URL. Never send this to the browser. */
function staticMapUrl(req: MapRequest): string {
	const q = new URLSearchParams();
	q.set('size', `${req.width}x${req.height}`);
	q.set('scale', '2');
	q.set('maptype', 'roadmap');
	q.set('format', 'png');
	if (req.center) q.set('center', fmt(req.center));
	if (req.zoom) q.set('zoom', String(req.zoom));
	for (const s of PAPER) q.append('style', s);
	if (req.numbered)
		req.pins
			.slice(0, 9)
			.forEach((p, i) => q.append('markers', `color:${ORANGE}|label:${i + 1}|${fmt(p)}`));
	else if (req.pins.length) q.append('markers', `color:${ORANGE}|${req.pins.map(fmt).join('|')}`);
	if (req.trail && req.pins.length > 1)
		q.append('path', `color:${ORANGE}cc|weight:3|geodesic:true|${req.pins.map(fmt).join('|')}`);
	q.set('key', GOOGLE_MAPS_API_KEY ?? '');
	return `https://maps.googleapis.com/maps/api/staticmap?${q.toString()}`;
}

type MapImage = { type: string; body: ArrayBuffer };
const imageCache = ttlCache<MapImage>(DAY, 300);

/** Fetch (or serve from cache) a rendered map image. Null when Maps is off or Google fails. */
export async function staticMap(req: MapRequest): Promise<MapImage | null> {
	if (!GOOGLE_MAPS_API_KEY) return null;
	const url = staticMapUrl(req);
	const hit = imageCache.get(url);
	if (hit) return hit;
	try {
		trackCall('maps.static', 'map.static');
		const res = await timedFetch(url);
		const type = res.headers.get('content-type') || '';
		if (!res.ok || !type.startsWith('image/')) return null;
		return imageCache.set(url, { type, body: await res.arrayBuffer() });
	} catch {
		return null;
	}
}
