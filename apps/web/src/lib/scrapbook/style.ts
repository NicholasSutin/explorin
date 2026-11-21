/**
 * How a scrapbook looks. Every day's page has its own look (paper colour and pattern, accent, washi tape, photo
 * frames); the book has a cover (cloth, cloth pattern, elastic band, title) and endpapers for the contents and end
 * pages. A page's look is the defaults, then the book's look for new pages, then the page's own choices
 * (`resolvePage`). Shared by the book, the PNG export and the server, which stores only what `cleanPageStyle` and
 * `cleanCoverStyle` accept.
 */

export const PAPER_PATTERNS = [
	'dots',
	'grid',
	'lines',
	'blank',
	'gingham',
	'stripes',
	'confetti'
] as const;
export const COVER_PATTERNS = [
	'cloth',
	'pinstripe',
	'gingham',
	'polka',
	'chevron',
	'stars',
	'topo',
	'flowers'
] as const;
export const TAPE_PATTERNS = ['plain', 'stripes', 'dots', 'checks'] as const;

export type PaperPattern = (typeof PAPER_PATTERNS)[number];
export type CoverPattern = (typeof COVER_PATTERNS)[number];
export type TapePattern = (typeof TAPE_PATTERNS)[number];

export interface PageStyle {
	paper: string;
	pattern: PaperPattern;
	accent: string;
	tape: string;
	tapePattern: TapePattern;
	frame: string;
}

export interface CoverStyle {
	cloth: string;
	pattern: CoverPattern;
	band: string;
	title: string;
	endpaper: string;
}

export const DEFAULT_PAGE: PageStyle = {
	paper: '#fbf8ef',
	pattern: 'dots',
	accent: '#d96738',
	tape: '#efe1b3',
	tapePattern: 'plain',
	frame: '#fffdf6'
};

export const DEFAULT_COVER: CoverStyle = {
	cloth: '#285c47',
	pattern: 'cloth',
	band: '#d96738',
	title: 'Field notes',
	endpaper: '#f4eedc'
};

export const TITLE_MAX = 22;

export interface Swatch {
	hex: string;
	name: string;
}

export const SWATCHES = {
	paper: [
		{ hex: '#fbf8ef', name: 'Cream' },
		{ hex: '#fdfdfb', name: 'White' },
		{ hex: '#fbf0cc', name: 'Butter' },
		{ hex: '#f8e6e0', name: 'Blush' },
		{ hex: '#e4ecdd', name: 'Sage' },
		{ hex: '#e3ecf5', name: 'Sky' },
		{ hex: '#ece6f3', name: 'Lavender' },
		{ hex: '#d6bf98', name: 'Kraft' },
		{ hex: '#1f2b40', name: 'Midnight' },
		{ hex: '#26302f', name: 'Charcoal' }
	],
	accent: [
		{ hex: '#d96738', name: 'Explorin orange' },
		{ hex: '#c2413b', name: 'Tomato' },
		{ hex: '#e0a91f', name: 'Mustard' },
		{ hex: '#2f7d5b', name: 'Fern' },
		{ hex: '#2f6fa5', name: 'Cobalt' },
		{ hex: '#7a4fa0', name: 'Violet' },
		{ hex: '#d0607f', name: 'Rose' },
		{ hex: '#203d32', name: 'Ink' }
	],
	tape: [
		{ hex: '#efe1b3', name: 'Masking' },
		{ hex: '#f3e27a', name: 'Lemon' },
		{ hex: '#f6c99a', name: 'Peach' },
		{ hex: '#f2c6c2', name: 'Pink' },
		{ hex: '#dccdea', name: 'Lilac' },
		{ hex: '#c6d7ee', name: 'Powder blue' },
		{ hex: '#c4e1cf', name: 'Mint' },
		{ hex: '#e9e4da', name: 'Linen' }
	],
	frame: [
		{ hex: '#fffdf6', name: 'Polaroid white' },
		{ hex: '#f3ead6', name: 'Cream' },
		{ hex: '#cdb184', name: 'Kraft' },
		{ hex: '#f6d9de', name: 'Pink' },
		{ hex: '#d9e6f1', name: 'Blue' },
		{ hex: '#1e1f1d', name: 'Black' }
	],
	cloth: [
		{ hex: '#285c47', name: 'Forest' },
		{ hex: '#26385a', name: 'Navy' },
		{ hex: '#7a2e2e', name: 'Oxblood' },
		{ hex: '#c2603a', name: 'Terracotta' },
		{ hex: '#d9a52a', name: 'Mustard' },
		{ hex: '#e7b9b4', name: 'Blush' },
		{ hex: '#8fb3c9', name: 'Dusty blue' },
		{ hex: '#5b4a7a', name: 'Plum' },
		{ hex: '#c9b48f', name: 'Linen' },
		{ hex: '#2b2b2b', name: 'Charcoal' }
	],
	band: [
		{ hex: '#d96738', name: 'Orange' },
		{ hex: '#c2413b', name: 'Red' },
		{ hex: '#f0c64a', name: 'Yellow' },
		{ hex: '#f8f6ef', name: 'Cream' },
		{ hex: '#e7b9b4', name: 'Pink' },
		{ hex: '#285c47', name: 'Green' },
		{ hex: '#26385a', name: 'Navy' },
		{ hex: '#1e1f1d', name: 'Black' }
	],
	endpaper: [
		{ hex: '#f4eedc', name: 'Cream' },
		{ hex: '#fdfdfb', name: 'White' },
		{ hex: '#f3e2dc', name: 'Blush' },
		{ hex: '#e1e9db', name: 'Sage' },
		{ hex: '#e0e9f2', name: 'Sky' },
		{ hex: '#d6bf98', name: 'Kraft' },
		{ hex: '#26302f', name: 'Charcoal' }
	]
} satisfies Record<string, Swatch[]>;

export const PAPER_NAMES: Record<PaperPattern, string> = {
	dots: 'Dot grid',
	grid: 'Graph',
	lines: 'Ruled',
	blank: 'Plain',
	gingham: 'Gingham',
	stripes: 'Stripes',
	confetti: 'Confetti'
};
export const COVER_NAMES: Record<CoverPattern, string> = {
	cloth: 'Plain cloth',
	pinstripe: 'Pinstripe',
	gingham: 'Gingham',
	polka: 'Polka dot',
	chevron: 'Chevron',
	stars: 'Stars',
	topo: 'Topo map',
	flowers: 'Flowers'
};
export const TAPE_NAMES: Record<TapePattern, string> = {
	plain: 'Plain',
	stripes: 'Stripes',
	dots: 'Dots',
	checks: 'Checks'
};

/** One-tap looks for a page; each sets every page option. */
export const LOOKS: { name: string; style: PageStyle }[] = [
	{ name: 'Field notes', style: DEFAULT_PAGE },
	{
		name: 'Kraft',
		style: {
			paper: '#d6bf98',
			pattern: 'grid',
			accent: '#c2413b',
			tape: '#f3e27a',
			tapePattern: 'stripes',
			frame: '#fffdf6'
		}
	},
	{
		name: 'Sorbet',
		style: {
			paper: '#f8e6e0',
			pattern: 'gingham',
			accent: '#d0607f',
			tape: '#c4e1cf',
			tapePattern: 'stripes',
			frame: '#fffdf6'
		}
	},
	{
		name: 'Seaside',
		style: {
			paper: '#e3ecf5',
			pattern: 'stripes',
			accent: '#2f6fa5',
			tape: '#f6c99a',
			tapePattern: 'dots',
			frame: '#fffdf6'
		}
	},
	{
		name: 'Meadow',
		style: {
			paper: '#e4ecdd',
			pattern: 'lines',
			accent: '#e0a91f',
			tape: '#f2c6c2',
			tapePattern: 'checks',
			frame: '#f3ead6'
		}
	},
	{
		name: 'Midnight',
		style: {
			paper: '#1f2b40',
			pattern: 'confetti',
			accent: '#f0c64a',
			tape: '#c6d7ee',
			tapePattern: 'dots',
			frame: '#fffdf6'
		}
	}
];

// ---------------------------------------------------------------------------------------------------------------
// Colour arithmetic: contrast-safe inks for whatever colour someone picks.

const HEX = /^#[0-9a-f]{6}$/;

function rgb(hex: string): [number, number, number] {
	const n = parseInt(hex.slice(1), 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** `a` blended toward `b` by `t` (0..1). */
export function mix(a: string, b: string, t: number): string {
	const x = rgb(a);
	const y = rgb(b);
	return `#${x
		.map((v, i) =>
			Math.round(v + (y[i] - v) * t)
				.toString(16)
				.padStart(2, '0')
		)
		.join('')}`;
}

/** WCAG relative luminance. */
export function luminance(hex: string): number {
	const [r, g, b] = rgb(hex).map((v) => {
		const c = v / 255;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (hi + 0.05) / (lo + 0.05);
}

/** `light` when it reads at least as large-text AA (3:1) on `bg`, else whichever of the two reads better. */
export function readable(bg: string, dark: string, light: string): string {
	if (contrast(bg, light) >= 3) return light;
	return contrast(bg, dark) >= contrast(bg, light) ? dark : light;
}

const INK = '#203d32';
const INK_LIGHT = '#f1ead8';

/**
 * Text colour for a custom background: the brand's green ink or its cream, whichever reads better; on mid-tones where
 * neither reaches 4.5:1, near-black or white instead.
 */
function inkOn(bg: string): { ink: string; dark: boolean } {
	const dark = contrast(bg, INK_LIGHT) > contrast(bg, INK);
	const ink = dark ? INK_LIGHT : INK;
	if (contrast(bg, ink) >= 4.5) return { ink, dark };
	const black = '#000000';
	return contrast(bg, '#ffffff') > contrast(bg, black)
		? { ink: '#ffffff', dark: true }
		: { ink: black, dark: false };
}

/** Every colour a page draws with, derived from its style. */
export function pagePalette(s: PageStyle) {
	const { ink, dark } = inkOn(s.paper);
	const tapeDark = luminance(s.tape) < 0.3;
	return {
		paper: s.paper,
		dark,
		ink,
		pen:
			contrast(s.paper, dark ? '#cfdcf2' : '#26385a') >= 4.5 ? (dark ? '#cfdcf2' : '#26385a') : ink,
		rule: dark ? '#8aa4bd' : '#7d9bb5',
		vignette: dark ? mix(s.paper, '#000000', 0.45) : mix(s.paper, '#6b5a2e', 0.25),
		accent: s.accent,
		/** The accent as text on the paper; nudged toward the ink if it would vanish. */
		accentText: contrast(s.accent, s.paper) >= 2.2 ? s.accent : mix(s.accent, ink, 0.55),
		pattern: s.accent,
		tape: s.tape,
		tapeMark: tapeDark ? mix(s.tape, '#ffffff', 0.4) : mix(s.tape, INK, 0.2),
		frame: s.frame,
		frameText: readable(s.frame, '#26385a', INK_LIGHT),
		placeholder: mix(s.frame, luminance(s.frame) < 0.3 ? '#ffffff' : INK, 0.1),
		stickers: [
			{ fill: s.accent, ink: readable(s.accent, INK, '#ffffff') },
			{ fill: ink, ink: s.paper },
			{ fill: s.tape, ink: readable(s.tape, INK, INK_LIGHT) }
		]
	};
}
export type PagePalette = ReturnType<typeof pagePalette>;

/** Cover and endpaper colours. */
export function coverPalette(c: CoverStyle) {
	const clothDark = luminance(c.cloth) < 0.25;
	const { ink: endInk, dark: endDark } = inkOn(c.endpaper);
	const endPen = endDark ? '#cfdcf2' : '#26385a';
	return {
		cloth: c.cloth,
		spine: mix(c.cloth, '#000000', 0.28),
		seam: mix(c.cloth, '#000000', 0.6),
		pattern: clothDark ? mix(c.cloth, '#ffffff', 0.3) : mix(c.cloth, '#000000', 0.2),
		band: c.band,
		endpaper: c.endpaper,
		/** Page stack under the open book. */
		edge: endDark ? mix(c.endpaper, '#000000', 0.3) : mix(c.endpaper, '#6b5a2e', 0.1),
		endInk,
		endPen: contrast(c.endpaper, endPen) >= 4.5 ? endPen : endInk,
		endRule: endDark ? '#8aa4bd' : '#7d9bb5'
	};
}
export type CoverPalette = ReturnType<typeof coverPalette>;

// ---------------------------------------------------------------------------------------------------------------
// Validation: what may be stored, and what a stored value means when read back.

function hex(v: unknown): string | undefined {
	if (typeof v !== 'string') return undefined;
	const s = v.trim().toLowerCase();
	return HEX.test(s) ? s : undefined;
}
function oneOf<T extends string>(list: readonly T[], v: unknown): T | undefined {
	return (list as readonly unknown[]).includes(v) ? (v as T) : undefined;
}
function defined<T extends object>(o: T): Partial<T> {
	return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

export function cleanTitle(v: unknown): string | undefined {
	if (typeof v !== 'string') return undefined;
	const s = v
		.replace(/[\p{Cc}\p{Cf}]/gu, ' ')
		.replace(/\s+/g, ' ')
		.trim();
	return s ? [...s].slice(0, TITLE_MAX).join('').trim() : undefined;
}

/** The recognised page options in `v`, normalised; anything else is dropped. */
export function cleanPageStyle(v: unknown): Partial<PageStyle> {
	if (!v || typeof v !== 'object') return {};
	const o = v as Record<string, unknown>;
	return defined({
		paper: hex(o.paper),
		pattern: oneOf(PAPER_PATTERNS, o.pattern),
		accent: hex(o.accent),
		tape: hex(o.tape),
		tapePattern: oneOf(TAPE_PATTERNS, o.tapePattern),
		frame: hex(o.frame)
	});
}

export function cleanCoverStyle(v: unknown): Partial<CoverStyle> {
	if (!v || typeof v !== 'object') return {};
	const o = v as Record<string, unknown>;
	return defined({
		cloth: hex(o.cloth),
		pattern: oneOf(COVER_PATTERNS, o.pattern),
		band: hex(o.band),
		title: cleanTitle(o.title),
		endpaper: hex(o.endpaper)
	});
}

/** True when every key in `v` is recognised and valid, so a request can be refused instead of half-saved. */
export function isValidStyle(v: unknown, kind: 'page' | 'cover'): boolean {
	if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
	const clean = kind === 'page' ? cleanPageStyle(v) : cleanCoverStyle(v);
	return Object.keys(v).every((k) => k in clean);
}

/** A page's look: the defaults, then each layer in order (the book's look for pages, then the page's own). */
export function resolvePage(...layers: unknown[]): PageStyle {
	return Object.assign({}, DEFAULT_PAGE, ...layers.map(cleanPageStyle));
}

export function resolveCover(v: unknown): CoverStyle {
	return { ...DEFAULT_COVER, ...cleanCoverStyle(v) };
}

export function sameStyle(a: object, b: object): boolean {
	const ka = Object.keys(a);
	return (
		ka.length === Object.keys(b).length &&
		ka.every((k) => (a as Record<string, unknown>)[k] === (b as Record<string, unknown>)[k])
	);
}
