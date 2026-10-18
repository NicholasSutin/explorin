/** Small geometry helpers shared by the planner (stop order, branches) and the trip map (distances, walk times). */
import type { LatLng } from './adventure';

const R = 6371000;
const rad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in metres. */
export function distanceM(a: LatLng, b: LatLng): number {
	const dLat = rad(b.lat - a.lat);
	const dLng = rad(b.lng - a.lng);
	const h =
		Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
	return 2 * R * Math.asin(Math.sqrt(h));
}

/** Rough walking time: streets add about 30% to the straight line, at 80 m per minute. */
export const walkMinutes = (m: number) => Math.max(1, Math.round((m * 1.3) / 80));

export function formatDistance(m: number): string {
	return m < 950 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;
}

/** Past this, a stop is a transit hop rather than a walk. */
export const WALKABLE_M = 2200;

function* permutations<T>(items: T[]): Generator<T[]> {
	if (items.length < 2) {
		yield items;
		return;
	}
	for (let i = 0; i < items.length; i++)
		for (const rest of permutations([...items.slice(0, i), ...items.slice(i + 1)]))
			yield [items[i], ...rest];
}

/** Straight-line length of a walk through the points in order. */
export const pathM = (points: LatLng[]) =>
	points.slice(1).reduce((m, p, i) => m + distanceM(points[i], p), 0);

/**
 * Visiting order for the planner's stops. The planner lists them in the order its copy describes ("start with
 * coffee", "end at the river"), so the first and last stay put; the ones between are reordered only when that
 * saves a real detour (at least 300 m and 15% of the walk), which keeps the day's rhythm otherwise. Every order of
 * the middle is tried: at most 720 for the 8 stops a day can have. Items without coordinates go last.
 */
export function routeStops<T>(items: T[], at: (t: T) => LatLng | undefined): T[] {
	const placed = items.filter((t) => at(t));
	const rest = items.filter((t) => !at(t));
	if (placed.length < 4) return [...placed, ...rest];
	const first = placed[0];
	const last = placed[placed.length - 1];
	const length = (route: T[]) => pathM(route.map((t) => at(t)!));
	const given = length(placed);
	let best = placed;
	let bestM = given;
	for (const middle of permutations(placed.slice(1, -1))) {
		const route = [first, ...middle, last];
		const m = length(route);
		if (m < bestM) {
			best = route;
			bestM = m;
		}
	}
	return [...(given - bestM >= Math.max(300, given * 0.15) ? best : placed), ...rest];
}
