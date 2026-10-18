/** Client-side helpers for the trip screens: what is selected on the map, and leg distances. */
import type { Happening, LatLng } from './adventure';
import { distanceM, walkMinutes, WALKABLE_M, formatDistance } from './geo';

export type Selection =
	| { kind: 'stop'; id: string }
	| { kind: 'happening'; id: string }
	| { kind: 'landmark'; placeId: string; at: LatLng };

export const samePick = (a: Selection | null, b: Selection | null) =>
	!!a &&
	!!b &&
	a.kind === b.kind &&
	(a.kind === 'landmark'
		? a.placeId === (b as typeof a).placeId
		: a.id === (b as { id: string }).id);

export interface Leg {
	meters: number;
	minutes: number;
	transit: boolean;
	label: string;
}

export function leg(from: LatLng | undefined | null, to: LatLng | undefined): Leg | null {
	if (!from || !to) return null;
	const meters = distanceM(from, to);
	const transit = meters > WALKABLE_M;
	return {
		meters,
		minutes: walkMinutes(meters),
		transit,
		label: transit ? `${formatDistance(meters)} · transit` : `${walkMinutes(meters)} min walk`
	};
}

/** "11:00 AM – 3:00 PM" from the dataset's floating local times. */
export function happeningTime(h: Happening): string {
	const fmt = (s: string) => {
		const [hh, mm] = s.slice(11, 16).split(':').map(Number);
		const ap = hh >= 12 ? 'PM' : 'AM';
		const h12 = hh % 12 || 12;
		return mm ? `${h12}:${String(mm).padStart(2, '0')} ${ap}` : `${h12} ${ap}`;
	};
	return `${fmt(h.starts)} – ${fmt(h.ends)}`;
}
