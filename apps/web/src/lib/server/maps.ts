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
 * (feature|element|rules), which is what `paper` and `ink` use. If GOOGLE_MAPS_MAP_ID is set
 * (a Cloud-based map style from the console), `style=cloud` passes it as `map_id` instead.
 */
import { GOOGLE_MAPS_API_KEY, GOOGLE_MAPS_MAP_ID } from '$app/env/private';
import type { LatLng } from '#lib/adventure';

export const mapsEnabled = () => Boolean(GOOGLE_MAPS_API_KEY);

export type MapStyle = 'paper' | 'ink' | 'cloud';
export const MAP_STYLES: MapStyle[] = ['paper', 'ink', 'cloud'];

/* Brand palette from packages/brand/README.md */
const INK = '0x203d32';
const CREAM = '0xf8f6ef';
const MOSS = '0xe5ebdf';
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

/** Night-ink look for dark surfaces: deep green ground, cream roads, orange water accents. */
const INK_STYLE = [
	`feature:all|element:geometry|color:0x1d3a30`,
	`feature:all|element:labels.text.fill|color:0xdfe6d8`,
	`feature:all|element:labels.text.stroke|color:${INK}|weight:2`,
	`feature:all|element:labels.icon|visibility:off`,
	`feature:administrative|element:geometry.stroke|color:0x3b5a4c`,
	`feature:poi|element:labels|visibility:off`,
	`feature:poi|element:geometry|color:0x23463a`,
	`feature:poi.park|element:geometry|color:0x2d5a46`,
	`feature:road|element:geometry.fill|color:0x3f6a56`,
	`feature:road|element:geometry.stroke|color:0x1d3a30`,
	`feature:road|element:labels.text.fill|color:0xb9c7b4`,
	`feature:road.highway|element:geometry.fill|color:0x6f8f72`,
	`feature:road.highway|element:labels|visibility:off`,
	`feature:transit|visibility:off`,
	`feature:water|element:geometry|color:0x14271f`,
	`feature:water|element:labels.text.fill|color:0x8aa89c`
];

export interface MapRequest {
	/** Centre + zoom for a single place; omit both and pass `pins` for an auto-fitted overview. */
	center?: LatLng;
	zoom?: number;
	pins: LatLng[];
	width: number;
	height: number;
	style: MapStyle;
	/** Number the pins 1..9 (Static Maps labels are a single character). */
	numbered?: boolean;
	/** Draw a path through the pins in order (history "trail"). */
	trail?: boolean;
}

const fmt = (p: LatLng) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;

/** Build the upstream Static Maps URL. Exported for tests; never send this to the browser. */
export function staticMapUrl(req: MapRequest): string {
	const q = new URLSearchParams();
	q.set('size', `${req.width}x${req.height}`);
	q.set('scale', '2');
	q.set('maptype', 'roadmap');
	q.set('format', 'png');
	if (req.center) q.set('center', fmt(req.center));
	if (req.zoom) q.set('zoom', String(req.zoom));
	const style = req.style === 'cloud' && !GOOGLE_MAPS_MAP_ID ? 'paper' : req.style;
	if (style === 'cloud') q.set('map_id', GOOGLE_MAPS_MAP_ID!);
	else for (const s of style === 'ink' ? INK_STYLE : PAPER) q.append('style', s);
	const color = style === 'ink' ? '0xf2a071' : ORANGE;
	if (req.numbered)
		req.pins
			.slice(0, 9)
			.forEach((p, i) => q.append('markers', `color:${color}|label:${i + 1}|${fmt(p)}`));
	else if (req.pins.length) q.append('markers', `color:${color}|${req.pins.map(fmt).join('|')}`);
	if (req.trail && req.pins.length > 1)
		q.append(
			'path',
			`color:${style === 'ink' ? '0xf2a071cc' : '0xd96738cc'}|weight:3|geodesic:true|${req.pins.map(fmt).join('|')}`
		);
	q.set('key', GOOGLE_MAPS_API_KEY ?? '');
	return `https://maps.googleapis.com/maps/api/staticmap?${q.toString()}`;
}

const imageCache = new Map<string, { at: number; type: string; body: ArrayBuffer }>();
const DAY = 24 * 60 * 60 * 1000;
const MAX_CACHE = 300;

/** Fetch (or serve from cache) a rendered map image. Null when Maps is off or Google fails. */
export async function staticMap(
	req: MapRequest
): Promise<{ type: string; body: ArrayBuffer } | null> {
	if (!GOOGLE_MAPS_API_KEY) return null;
	const url = staticMapUrl(req);
	const hit = imageCache.get(url);
	if (hit && Date.now() - hit.at < DAY) return hit;
	const ctrl = new AbortController();
	const t = setTimeout(() => ctrl.abort(), 8000);
	try {
		const res = await fetch(url, { signal: ctrl.signal });
		const type = res.headers.get('content-type') || '';
		if (!res.ok || !type.startsWith('image/')) return null;
		const body = await res.arrayBuffer();
		if (imageCache.size >= MAX_CACHE) imageCache.delete(imageCache.keys().next().value!);
		const value = { at: Date.now(), type, body };
		imageCache.set(url, value);
		return value;
	} catch {
		return null;
	} finally {
		clearTimeout(t);
	}
}

/** Google Maps directions deep link: free, no key, opens the native app on phones. */
export function directionsUrl(coords: LatLng, placeId?: string): string {
	const q = new URLSearchParams({ api: '1', destination: fmt(coords) });
	if (placeId) q.set('destination_place_id', placeId);
	return `https://www.google.com/maps/dir/?${q.toString()}`;
}
