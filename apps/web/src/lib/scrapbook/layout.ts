/**
 * Geometry for one scrapbook page, shared by the on-screen SVG (Page.svelte) and the PNG export (export.ts) so a
 * shared story looks exactly like the page. Three formats: the book page (3:4), an Instagram story (9:16) and a
 * feed post (4:5). Everything is deterministic per trip (rotations come from a seed of the trip id), so a page
 * never reshuffles between visits.
 */
import { formatLatLng, type Trip } from '#lib/adventure';

export type Format = 'page' | 'story' | 'post';

export interface Slot {
	kind: 'photo' | 'map';
	href: string;
	/** Centre, size and rotation (degrees) of the image area; photos sit in a polaroid frame around it. */
	cx: number;
	cy: number;
	w: number;
	h: number;
	rot: number;
}

export interface Frame {
	cx: number;
	cy: number;
	w: number;
	h: number;
	rot: number;
	/** Image offset inside the frame (polaroid: equal sides, deep bottom). */
	pad: number;
	bottom: number;
	caption: string;
	tapes: { x: number; y: number; rot: number; w: number }[];
}

export interface Sticker {
	x: number;
	y: number;
	w: number;
	h: number;
	rot: number;
	text: string;
	fill: string;
	ink: string;
}

export interface PageModel {
	format: Format;
	w: number;
	h: number;
	m: number;
	seed: number;
	header: { y: number; size: number; left: string; right: string };
	title: { x: number; y: number; size: number; lines: string[] };
	subtitle: { y: number; size: number; text: string };
	frames: Frame[];
	slots: Slot[];
	stamp: { cx: number; cy: number; r: number; ring: string } | null;
	stops: {
		x: number;
		y: number;
		size: number;
		lineH: number;
		items: { n: number; name: string; visited: boolean; star: boolean }[];
	};
	note: {
		x: number;
		y: number;
		w: number;
		size: number;
		lineH: number;
		lines: string[];
		ruled: number;
	};
	stickers: Sticker[];
	emotions: { x: number; y: number; size: number; text: string };
	footer: { y: number; size: number; left: string; right: string };
}

interface Preset {
	w: number;
	h: number;
	m: number;
	headerY: number;
	headerSize: number;
	titleY: number;
	titleSize: number;
	titleLines: number;
	photos: { x: number; y: number; w: number; h: number };
	stamp: { cx: number; cy: number; r: number };
	stops: { x: number; y: number; w: number; size: number; lineH: number; max: number };
	note: { y: number; size: number; lineH: number; lines: number };
	stickersY: number;
	stickerSize: number;
	emotionsY: number;
	footerY: number;
	footerSize: number;
	mapPx: number;
}

const PRESETS: Record<Format, Preset> = {
	page: {
		w: 600,
		h: 800,
		m: 36,
		headerY: 50,
		headerSize: 11,
		titleY: 100,
		titleSize: 34,
		titleLines: 2,
		photos: { x: 36, y: 178, w: 330, h: 300 },
		stamp: { cx: 470, cy: 262, r: 82 },
		stops: { x: 392, y: 378, w: 176, size: 12.5, lineH: 19, max: 5 },
		note: { y: 522, size: 25, lineH: 31, lines: 4 },
		stickersY: 676,
		stickerSize: 12,
		emotionsY: 732,
		footerY: 772,
		footerSize: 11,
		mapPx: 360
	},
	post: {
		w: 1080,
		h: 1350,
		m: 64,
		headerY: 92,
		headerSize: 18,
		titleY: 176,
		titleSize: 62,
		titleLines: 2,
		photos: { x: 64, y: 320, w: 600, h: 560 },
		stamp: { cx: 860, cy: 470, r: 140 },
		stops: { x: 712, y: 668, w: 320, size: 22, lineH: 34, max: 6 },
		note: { y: 960, size: 46, lineH: 56, lines: 3 },
		stickersY: 1150,
		stickerSize: 21,
		emotionsY: 1240,
		footerY: 1296,
		footerSize: 19,
		mapPx: 560
	},
	story: {
		w: 1080,
		h: 1920,
		m: 72,
		headerY: 150,
		headerSize: 20,
		titleY: 250,
		titleSize: 76,
		titleLines: 3,
		photos: { x: 72, y: 470, w: 936, h: 640 },
		stamp: { cx: 822, cy: 1268, r: 136 },
		stops: { x: 72, y: 1186, w: 560, size: 26, lineH: 40, max: 6 },
		note: { y: 1520, size: 54, lineH: 64, lines: 3 },
		stickersY: 1700,
		stickerSize: 23,
		emotionsY: 1798,
		footerY: 1862,
		footerSize: 22,
		mapPx: 600
	}
};

/** Small seeded PRNG (mulberry32), seeded by the trip id. */
function rng(seed: number) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
export function seedOf(id: string) {
	let h = 2166136261;
	for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
	return h >>> 0;
}

/** Greedy word wrap using an average glyph width; good enough for the fonts we ship or rely on. */
export function wrap(
	text: string,
	maxWidth: number,
	size: number,
	factor: number,
	maxLines: number
): string[] {
	const per = Math.max(4, Math.floor(maxWidth / (size * factor)));
	const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
	const lines: string[] = [];
	let line = '';
	for (const w of words) {
		const next = line ? `${line} ${w}` : w;
		if (next.length <= per) line = next;
		else {
			if (line) lines.push(line);
			line = w.length > per ? w.slice(0, per - 1) + '…' : w;
		}
		if (lines.length === maxLines) break;
	}
	if (line && lines.length < maxLines) lines.push(line);
	const used = lines.join(' ').length;
	if (used < words.join(' ').length - 1 && lines.length) {
		const last = lines[lines.length - 1];
		lines[lines.length - 1] =
			(last.length > per - 1 ? last.slice(0, per - 1) : last).replace(/[,.;:!?\s]+$/, '') + '…';
	}
	return lines;
}

const STICKERS = [
	{ fill: '#d96738', ink: '#ffffff' },
	{ fill: '#285c47', ink: '#f8f6ef' },
	{ fill: '#e9dcb5', ink: '#203d32' }
];

export function shortDate(iso: string | null) {
	return (iso ? new Date(iso) : new Date())
		.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
		.toUpperCase();
}

/** The static paper-style map behind the stamp: a Google map, as Places-derived coordinates require. */
export function stampMap(trip: Trip, px: number): string | null {
	const pts = trip.stops
		.filter((s) => s.inPlan && (s.visitedFrom || s.coords))
		.map((s) => s.visitedFrom ?? s.coords!)
		.slice(0, 12);
	if (!pts.length) return null;
	const size = Math.min(640, Math.round(px));
	return `/api/map?pins=${pts.map(formatLatLng).join(';')}&numbered=1&trail=${pts.length > 1 ? 1 : 0}&w=${size}&h=${size}`;
}

export function layoutPage(trip: Trip, format: Format, pageNumber?: number): PageModel {
	const p = PRESETS[format];
	const seed = seedOf(trip.id + format);
	const rand = rng(seed);
	const jitter = (n: number) => (rand() * 2 - 1) * n;

	const titleText = trip.storyTitle ?? trip.title ?? 'A day out';
	let titleSize = p.titleSize;
	let titleLines = wrap(titleText, p.w - 2 * p.m, titleSize, 0.52, p.titleLines);
	if (titleLines.length === p.titleLines && titleLines.at(-1)!.endsWith('…')) {
		titleSize = Math.round(p.titleSize * 0.82);
		titleLines = wrap(titleText, p.w - 2 * p.m, titleSize, 0.52, p.titleLines);
	}
	const planned = trip.stops.filter((s) => s.inPlan);
	const visited = planned.filter((s) => s.visitedAt).length;

	// Polaroids
	const photos = trip.photoUrls.slice(0, 4);
	const R = p.photos;
	const frames: Frame[] = [];
	const slots: Slot[] = [];
	const n = photos.length;
	const layouts: Record<number, { x: number; y: number; s: number; r: number }[]> = {
		1: [{ x: 0.5, y: 0.5, s: 0.82, r: -3 }],
		2: [
			{ x: 0.34, y: 0.46, s: 0.6, r: -7 },
			{ x: 0.68, y: 0.56, s: 0.6, r: 6 }
		],
		3: [
			{ x: 0.27, y: 0.42, s: 0.5, r: -9 },
			{ x: 0.72, y: 0.4, s: 0.5, r: 7 },
			{ x: 0.5, y: 0.66, s: 0.5, r: -2 }
		],
		4: [
			{ x: 0.27, y: 0.3, s: 0.46, r: -7 },
			{ x: 0.73, y: 0.32, s: 0.46, r: 5 },
			{ x: 0.3, y: 0.72, s: 0.46, r: 4 },
			{ x: 0.72, y: 0.7, s: 0.46, r: -5 }
		]
	};
	(layouts[n] ?? []).forEach((spot, i) => {
		// Square-ish image in a polaroid frame sized to the region's shorter side.
		const fw = Math.min(R.w * spot.s, (R.h * spot.s) / 1.16);
		const pad = fw * 0.06;
		const iw = fw - 2 * pad;
		const ih = iw;
		const bottom = fw * 0.2;
		const fh = ih + pad + bottom;
		const cx = R.x + R.w * spot.x + jitter(R.w * 0.02);
		const cy = R.y + R.h * spot.y + jitter(R.h * 0.02);
		const rot = spot.r + jitter(2);
		const tapeW = fw * 0.34;
		frames.push({
			cx,
			cy,
			w: fw,
			h: fh,
			rot,
			pad,
			bottom,
			caption: `little moment / ${String(i + 1).padStart(2, '0')}`,
			tapes:
				i % 2 === 0
					? [{ x: 0, y: -fh / 2, rot: jitter(6) - 3, w: tapeW }]
					: [
							{
								x: -fw / 2 + tapeW * 0.25,
								y: -fh / 2 + tapeW * 0.12,
								rot: -38 + jitter(5),
								w: tapeW * 0.8
							},
							{
								x: fw / 2 - tapeW * 0.25,
								y: -fh / 2 + tapeW * 0.12,
								rot: 38 + jitter(5),
								w: tapeW * 0.8
							}
						]
		});
		// The image's own centre, in page space, after the frame's rotation.
		const offY = -fh / 2 + pad + ih / 2;
		const a = (rot * Math.PI) / 180;
		slots.push({
			kind: 'photo',
			href: photos[i],
			cx: cx - offY * Math.sin(a),
			cy: cy + offY * Math.cos(a),
			w: iw,
			h: ih,
			rot
		});
	});

	const map = stampMap(trip, p.mapPx);
	// Without photos the map stamp grows into the photo area.
	const stamp = map
		? n
			? { cx: p.stamp.cx, cy: p.stamp.cy, r: p.stamp.r }
			: { cx: R.x + R.w / 2, cy: R.y + R.h / 2, r: Math.min(R.w, R.h) * 0.42 }
		: null;
	if (map && stamp)
		slots.push({
			kind: 'map',
			href: map,
			cx: stamp.cx,
			cy: stamp.cy,
			w: stamp.r * 2,
			h: stamp.r * 2,
			rot: 0
		});

	const noteText = trip.note || trip.story || '';
	const noteW = p.w - 2 * p.m;
	const note = {
		x: p.m,
		y: p.note.y,
		w: noteW,
		size: p.note.size,
		lineH: p.note.lineH,
		lines: wrap(noteText, noteW, p.note.size, 0.4, p.note.lines),
		ruled: p.note.lines
	};

	// Stickers: up to three, left to right with a little tilt each.
	const stickers: Sticker[] = [];
	let sx = p.m;
	trip.bestFor.slice(0, 3).forEach((text, i) => {
		const label = text.toUpperCase();
		const w = label.length * p.stickerSize * 0.66 + p.stickerSize * 2.2;
		const h = p.stickerSize * 2.5;
		if (sx + w > p.w - p.m) return;
		stickers.push({
			x: sx,
			y: p.stickersY + jitter(p.stickerSize * 0.4),
			w,
			h,
			rot: jitter(5),
			text: label,
			...STICKERS[i % 3]
		});
		sx += w + p.stickerSize * 1.1;
	});

	const highlight = trip.highlightStopId;
	return {
		format,
		w: p.w,
		h: p.h,
		m: p.m,
		seed,
		header: {
			y: p.headerY,
			size: p.headerSize,
			left: 'EXPLORIN · FIELD NOTES',
			right: shortDate(trip.finishedAt ?? trip.createdAt)
		},
		title: { x: p.m, y: p.titleY, size: titleSize, lines: titleLines },
		subtitle: {
			y: p.titleY + (titleLines.length - 1) * titleSize * 1.12 + titleSize * 0.95,
			size: p.headerSize * 1.25,
			text: `${trip.city} · ${visited && visited < planned.length ? `${visited} of ${planned.length}` : planned.length} ${planned.length === 1 ? 'stop' : 'stops'}`
		},
		frames,
		slots,
		stamp: stamp
			? {
					...stamp,
					ring: `${trip.city.toUpperCase()} · ${shortDate(trip.finishedAt ?? trip.createdAt)} · `
				}
			: null,
		// The list keeps its place even when the map grows into the photo area: below the grown stamp is where
		// the note goes, and the spot the small stamp would have taken stays free.
		stops: {
			x: p.stops.x,
			y: p.stops.y,
			size: p.stops.size,
			lineH: p.stops.lineH,
			items: planned.slice(0, p.stops.max).map((s, i) => ({
				n: i + 1,
				name: wrap(s.place, p.stops.w - p.stops.size * 2, p.stops.size, 0.5, 1)[0] ?? s.place,
				visited: Boolean(s.visitedAt),
				star: s.id === highlight
			}))
		},
		note,
		stickers,
		emotions: {
			x: p.m,
			y: p.emotionsY,
			size: p.headerSize * 1.25,
			text: trip.emotions.map((e) => `#${e}`).join('  ')
		},
		footer: {
			y: p.footerY,
			size: p.footerSize,
			left: format === 'page' ? 'explorin.' : 'made with explorin.app',
			right: format === 'page' && pageNumber ? String(pageNumber) : ''
		}
	};
}
