/** Small geometry helpers shared by the planner (stop order) and the trip map (distances, walk times). */
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

/**
 * Visiting order for stops: start from `origin` (the person's position) or the first item, always walk to the
 * nearest unvisited stop, then improve with 2-opt. Items without coordinates keep their place at the end.
 * Plenty for the 5 to 8 stops of a day.
 */
export function orderStops<T>(items: T[], at: (t: T) => LatLng | undefined, origin?: LatLng): T[] {
	const placed = items.filter((t) => at(t));
	const rest = items.filter((t) => !at(t));
	if (placed.length < 3) return [...placed, ...rest];
	const left = [...placed];
	const route: T[] = [];
	let here = origin ?? at(left[0])!;
	while (left.length) {
		let best = 0;
		for (let i = 1; i < left.length; i++)
			if (distanceM(here, at(left[i])!) < distanceM(here, at(left[best])!)) best = i;
		const [next] = left.splice(best, 1);
		route.push(next);
		here = at(next)!;
	}
	const leg = (a: T, b: T) => distanceM(at(a)!, at(b)!);
	let improved = true;
	while (improved) {
		improved = false;
		for (let i = 0; i < route.length - 2; i++)
			for (let j = i + 2; j < route.length - 1; j++) {
				const before = leg(route[i], route[i + 1]) + leg(route[j], route[j + 1]);
				const after = leg(route[i], route[j]) + leg(route[i + 1], route[j + 1]);
				if (after + 1 < before) {
					route.splice(i + 1, j - i, ...route.slice(i + 1, j + 1).reverse());
					improved = true;
				}
			}
	}
	return [...route, ...rest];
}
