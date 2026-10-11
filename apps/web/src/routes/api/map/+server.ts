import { z } from 'zod';
import { staticMap, MAP_STYLES, type MapStyle } from '#lib/server/maps';
import { placesEnabled } from '#lib/server/places';
import type { RequestHandler } from './$types';

const coord = z.coerce.number().finite();
const query = z.object({
	lat: coord.min(-90).max(90).optional(),
	lng: coord.min(-180).max(180).optional(),
	/** "lat,lng;lat,lng" up to 12 pins; with no lat/lng the map auto-fits them. */
	pins: z
		.string()
		.regex(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?(;-?\d+(\.\d+)?,-?\d+(\.\d+)?){0,11}$/)
		.optional(),
	zoom: z.coerce.number().int().min(1).max(20).default(15),
	w: z.coerce.number().int().min(80).max(640).default(600),
	h: z.coerce.number().int().min(80).max(640).default(300),
	style: z.enum(MAP_STYLES as [MapStyle, ...MapStyle[]]).default('paper'),
	numbered: z.enum(['1', '0']).default('0'),
	trail: z.enum(['1', '0']).default('0')
});

/**
 * GET /api/map?lat=&lng=&zoom=&w=&h=&style=paper|ink|cloud
 * GET /api/map?pins=lat,lng;lat,lng&numbered=1&trail=1
 * Same-origin PNG so scrapbook exports can include it. 400 invalid, 503 no key, 502 upstream.
 */
export const GET: RequestHandler = async ({ url, setHeaders }) => {
	const parsed = query.safeParse(Object.fromEntries(url.searchParams));
	if (!parsed.success) return new Response('Invalid map request', { status: 400 });
	const p = parsed.data;
	const center =
		p.lat !== undefined && p.lng !== undefined ? { lat: p.lat, lng: p.lng } : undefined;
	const pins = p.pins
		? p.pins.split(';').map((s) => {
				const [lat, lng] = s.split(',').map(Number);
				return { lat, lng };
			})
		: [];
	if (!center && !pins.length) return new Response('Missing lat/lng or pins', { status: 400 });
	if (pins.some((c) => Math.abs(c.lat) > 90 || Math.abs(c.lng) > 180))
		return new Response('Invalid pin', { status: 400 });
	if (!placesEnabled()) return new Response('Maps not configured', { status: 503 });
	const image = await staticMap({
		center,
		zoom: center ? p.zoom : undefined,
		pins: center && !pins.length ? [center] : pins,
		width: p.w,
		height: p.h,
		style: p.style,
		numbered: p.numbered === '1',
		trail: p.trail === '1'
	});
	if (!image) return new Response('Map unavailable', { status: 502 });
	setHeaders({ 'Cache-Control': 'public, max-age=86400', 'Content-Type': image.type });
	return new Response(image.body);
};
