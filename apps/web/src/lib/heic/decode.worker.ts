/**
 * HEIC/HEIF decode Web Worker. Only Safari reads HEIC natively; everywhere else the photo is
 * handed to a bundled libheif build here and comes back as sRGB RGBA pixels.
 *
 * Runs in a worker because the libheif bundle embeds its WASM and compiles it synchronously, which
 * browsers only allow off the main thread, and because a 12 MP decode takes long enough to jank
 * the UI otherwise.
 */
import type { LibHeif } from 'libheif-js/libheif-wasm/libheif-bundle.mjs';
import { type HeifColorSpace, heifColorSpace } from './heif';
import { MAX_PIXELS, type DecodeRequest, type DecodeResponse } from './protocol';

let heifModule: Promise<LibHeif> | undefined;

/** Lazy so the 1.4 MB decoder is only fetched once a HEIC actually arrives. */
function loadHeif(): Promise<LibHeif> {
	heifModule ??= import('libheif-js/libheif-wasm/libheif-bundle.mjs').then((m) => m.default());
	return heifModule;
}

/**
 * Convert wide-gamut samples to sRGB by letting the browser do it: tagged `ImageData` written to
 * an sRGB canvas is colour-converted on the way in. Falls back to the samples as-is if this
 * browser's `ImageData` has no colour space support.
 */
function toSrgb(decoded: ImageData, from: HeifColorSpace): ImageData {
	if (from === 'srgb' || typeof OffscreenCanvas === 'undefined') return decoded;

	let tagged: ImageData;
	try {
		tagged = new ImageData(decoded.data, decoded.width, decoded.height, { colorSpace: from });
	} catch {
		return decoded;
	}

	const canvas = new OffscreenCanvas(decoded.width, decoded.height);
	const ctx = canvas.getContext('2d', { colorSpace: 'srgb', willReadFrequently: true });
	if (!ctx) return decoded;
	ctx.putImageData(tagged, 0, 0);
	return ctx.getImageData(0, 0, decoded.width, decoded.height, { colorSpace: 'srgb' });
}

async function decodeHeif(bytes: Uint8Array): Promise<ImageData> {
	const libheif = await loadHeif();
	// Malformed input is not thrown; it is logged and yields an empty list.
	const images = new libheif.HeifDecoder().decode(bytes);
	if (!images.length) throw new Error('Could not read this file as a HEIC photo.');

	// The primary image comes first in every file seen so far.
	const [image] = images;
	try {
		const width = image.get_width();
		const height = image.get_height();
		if (width * height > MAX_PIXELS) {
			throw new Error(
				`Photo is too large (${Math.round((width * height) / 1e6)} MP; the limit is ${MAX_PIXELS / 1e6} MP).`
			);
		}

		// libheif writes RGBA in the file's own colour space, with no profile attached.
		const target = new ImageData(width, height);
		await new Promise<void>((resolve, reject) => {
			image.display(target, (out) =>
				out ? resolve() : reject(new Error('Could not decode the image inside this HEIC file.'))
			);
		});
		return toSrgb(target, heifColorSpace(bytes) ?? 'srgb');
	} finally {
		for (const held of images) held.free();
	}
}

self.addEventListener('message', async (event: MessageEvent<DecodeRequest>) => {
	const { id, bytes } = event.data;
	try {
		const image = await decodeHeif(bytes);
		const buffer = image.data.buffer as ArrayBuffer;
		const response: DecodeResponse = {
			id,
			ok: true,
			width: image.width,
			height: image.height,
			buffer
		};
		self.postMessage(response, { transfer: [buffer] });
	} catch (err) {
		const response: DecodeResponse = {
			id,
			ok: false,
			message: err instanceof Error ? err.message : 'HEIC decoding failed.'
		};
		self.postMessage(response);
	}
});
