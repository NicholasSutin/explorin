/**
 * Just enough ISO base media file format (ISO/IEC 14496-12) reading to answer two questions about
 * a HEIF file that the decoder itself cannot tell us: is this a HEIF at all, and what colour space
 * are the primary image's pixels in?
 *
 * The second question matters because libheif hands back raw RGBA with no colour information
 * attached. iPhone HEICs are Display P3, so encoding those samples as if they were sRGB would
 * visibly desaturate the result. The native `createImageBitmap` path has no such problem (the
 * browser converts to the canvas colour space on draw), so this only exists for the fallback.
 *
 * Keep this module free of DOM imports: it is bundled into the decode worker.
 * Ported from ~/Projects/portfolio (web-image-optimizer/heif.ts).
 */

/** The colour spaces `ImageData` can be tagged with, which is all we can act on. */
export type HeifColorSpace = 'srgb' | 'display-p3';

/**
 * `ftyp` brands that mean "HEIF holding something libheif can decode". `mif1`/`msf1` are the
 * generic HEIF brands, so AVIF files carry them too; those are excluded separately, since the
 * browser decodes AVIF natively and should keep doing so.
 */
const HEIF_BRANDS = new Set([
	'heic',
	'heix',
	'heim',
	'heis',
	'hevc',
	'hevx',
	'hevm',
	'hevs',
	'mif1',
	'msf1'
]);

const AVIF_BRANDS = new Set(['avif', 'avis']);

/** Bytes needed to read the `ftyp` box: its size, type, major brand, and a few compatible brands. */
export const SNIFF_BYTES = 32;

interface Box {
	type: string;
	/** First byte after the box header, where its payload starts. */
	body: number;
	/** One past the last byte of the box. */
	end: number;
}

/** The boxes laid out sequentially in `[start, end)`. Stops at the first malformed length. */
function boxes(view: DataView, start: number, end: number): Box[] {
	const found: Box[] = [];
	let offset = start;
	while (offset + 8 <= end) {
		let size = view.getUint32(offset);
		let header = 8;
		if (size === 1) {
			// 64-bit length. Sizes past 2^53 cannot be a real box in a File we already hold.
			if (offset + 16 > end) break;
			size = Number(view.getBigUint64(offset + 8));
			header = 16;
		} else if (size === 0) {
			size = end - offset; // "extends to end of file"
		}
		if (size < header || offset + size > end) break;
		found.push({ type: fourcc(view, offset + 4), body: offset + header, end: offset + size });
		offset += size;
	}
	return found;
}

function fourcc(view: DataView, offset: number): string {
	return String.fromCharCode(
		view.getUint8(offset),
		view.getUint8(offset + 1),
		view.getUint8(offset + 2),
		view.getUint8(offset + 3)
	);
}

/**
 * Whether these leading bytes look like a HEIF file libheif should try. Only the `ftyp` box is
 * read, so `SNIFF_BYTES` from the front of the file is enough.
 */
export function isHeif(bytes: Uint8Array): boolean {
	if (bytes.length < 12) return false;
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	if (fourcc(view, 4) !== 'ftyp') return false;

	const size = Math.min(view.getUint32(0), bytes.length);
	const brands: string[] = [fourcc(view, 8)];
	for (let offset = 16; offset + 4 <= size; offset += 4) brands.push(fourcc(view, offset));

	if (brands.some((brand) => AVIF_BRANDS.has(brand))) return false;
	return brands.some((brand) => HEIF_BRANDS.has(brand));
}

// ── Colour space of the primary image ──

/**
 * XYZ primaries as they appear in an ICC profile's `rXYZ`/`gXYZ`/`bXYZ` tags, for the two spaces
 * `ImageData` understands. Matching on the red and green primaries alone is enough to separate
 * them; they differ by ~0.08, far beyond the s15Fixed16 rounding.
 */
const ICC_PRIMARIES: { space: HeifColorSpace; red: number; green: number }[] = [
	{ space: 'display-p3', red: 0.5151, green: 0.292 },
	{ space: 'srgb', red: 0.4361, green: 0.3851 }
];

/** How close an ICC profile's primaries must sit to a known set to be treated as that space. */
const PRIMARY_TOLERANCE = 0.02;

/** CICP colour primaries code for Display P3 (P3-D65), as used in an `nclx` colour box. */
const CICP_DISPLAY_P3 = 12;

/**
 * The colour space of the file's primary image, or `null` when it cannot be determined, in which
 * case the caller should treat the samples as sRGB.
 *
 * Resolved through `pitm` → `ipma` → `ipco` rather than by grabbing the first `colr` box in the
 * file: an iPhone HEIC carries several, one per thumbnail and auxiliary image.
 */
export function heifColorSpace(bytes: Uint8Array): HeifColorSpace | null {
	try {
		const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
		const meta = boxes(view, 0, bytes.length).find((box) => box.type === 'meta');
		if (!meta) return null;

		// `meta` is a FullBox: skip its version and flags before the child boxes.
		const children = boxes(view, meta.body + 4, meta.end);
		const pitm = children.find((box) => box.type === 'pitm');
		const iprp = children.find((box) => box.type === 'iprp');
		if (!pitm || !iprp) return null;

		const primaryId =
			view.getUint8(pitm.body) === 0
				? view.getUint16(pitm.body + 4)
				: view.getUint32(pitm.body + 4);

		const properties = boxes(view, iprp.body, iprp.end);
		const ipco = properties.find((box) => box.type === 'ipco');
		const ipma = properties.find((box) => box.type === 'ipma');
		if (!ipco || !ipma) return null;

		const colr = findPrimaryColr(view, ipma, boxes(view, ipco.body, ipco.end), primaryId);
		if (!colr) return null;

		const kind = fourcc(view, colr.body);
		if (kind === 'nclx') {
			return view.getUint16(colr.body + 4) === CICP_DISPLAY_P3 ? 'display-p3' : 'srgb';
		}
		if (kind === 'prof' || kind === 'rICC') return iccColorSpace(view, colr.body + 4, colr.end);
		return null;
	} catch {
		// A truncated or malformed container is not worth failing the decode over.
		return null;
	}
}

/** The `colr` property associated with `itemId` by the item-property-association box. */
function findPrimaryColr(
	view: DataView,
	ipma: Box,
	properties: Box[],
	itemId: number
): Box | undefined {
	const version = view.getUint8(ipma.body);
	const flags = (view.getUint8(ipma.body + 1) << 16) | view.getUint16(ipma.body + 2);
	/** Flag bit 0 widens each property index from 7 to 15 bits. */
	const wideIndices = (flags & 1) === 1;

	let offset = ipma.body + 4;
	const entries = view.getUint32(offset);
	offset += 4;

	for (let entry = 0; entry < entries; entry++) {
		const id = version < 1 ? view.getUint16(offset) : view.getUint32(offset);
		offset += version < 1 ? 2 : 4;

		const count = view.getUint8(offset);
		offset += 1;

		const indices: number[] = [];
		for (let i = 0; i < count; i++) {
			// The high bit is the "essential" flag, not part of the index.
			indices.push(wideIndices ? view.getUint16(offset) & 0x7fff : view.getUint8(offset) & 0x7f);
			offset += wideIndices ? 2 : 1;
		}

		if (id !== itemId) continue;
		// Property indices are 1-based into `ipco`.
		return indices.map((index) => properties[index - 1]).find((box) => box?.type === 'colr');
	}
	return undefined;
}

/** Identify an ICC profile by its RGB primaries. Returns `null` for anything unrecognised. */
function iccColorSpace(view: DataView, start: number, end: number): HeifColorSpace | null {
	if (end - start < 132) return null;

	const tagCount = view.getUint32(start + 128);
	const rXYZ = findTag(view, start, end, tagCount, 'rXYZ');
	const gXYZ = findTag(view, start, end, tagCount, 'gXYZ');
	if (rXYZ === null || gXYZ === null || rXYZ + 20 > end || gXYZ + 20 > end) return null;

	// XYZType: 4-byte signature, 4 reserved bytes, then three s15Fixed16 values.
	const red = view.getInt32(rXYZ + 8) / 65536;
	const green = view.getInt32(gXYZ + 8) / 65536;

	const match = ICC_PRIMARIES.find(
		(candidate) =>
			Math.abs(candidate.red - red) < PRIMARY_TOLERANCE &&
			Math.abs(candidate.green - green) < PRIMARY_TOLERANCE
	);
	return match?.space ?? null;
}

function findTag(
	view: DataView,
	start: number,
	end: number,
	tagCount: number,
	signature: string
): number | null {
	for (let tag = 0; tag < tagCount; tag++) {
		const entry = start + 132 + tag * 12;
		if (entry + 12 > end) return null;
		if (fourcc(view, entry) === signature) return start + view.getUint32(entry + 4);
	}
	return null;
}
