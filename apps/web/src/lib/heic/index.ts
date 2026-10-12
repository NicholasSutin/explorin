/**
 * Browser-side image decoding that accepts HEIC/HEIF alongside the formats browsers read natively.
 *
 * Native `createImageBitmap` is tried first, so Safari (which reads HEIC itself) never downloads
 * the fallback decoder. Anything else that fails and sniffs as HEIF is decoded in a worker with
 * libheif and returned as a bitmap the caller can draw to a canvas like any other.
 */
import { isHeif, SNIFF_BYTES } from './heif';
import type { DecodeRequest, DecodeResponse } from './protocol';

/** `accept` attribute for photo inputs. Extensions included because Android/Chrome often report
 * an empty MIME type for HEIC files picked from the gallery. */
export const PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif';

const HEIC_TYPES = new Set([
	'image/heic',
	'image/heif',
	'image/heic-sequence',
	'image/heif-sequence'
]);

/** Whether a picked file is a HEIC/HEIF by MIME type or, failing that, by extension. */
export function isHeicFile(file: File): boolean {
	if (HEIC_TYPES.has(file.type.toLowerCase())) return true;
	return !file.type && /\.hei[cf]$/i.test(file.name);
}

/** Whether a picked file is a photo this app can take: any image type, or an untyped HEIC. */
export function isAcceptedPhoto(file: File): boolean {
	return file.type.startsWith('image/') || isHeicFile(file);
}

let worker: Worker | undefined;
let nextId = 0;
const pending = new Map<number, { resolve: (d: ImageData) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
	if (worker) return worker;
	worker = new Worker(new URL('./decode.worker.ts', import.meta.url), { type: 'module' });
	worker.addEventListener('message', (event: MessageEvent<DecodeResponse>) => {
		const msg = event.data;
		const job = pending.get(msg.id);
		if (!job) return;
		pending.delete(msg.id);
		if (msg.ok) {
			job.resolve(new ImageData(new Uint8ClampedArray(msg.buffer), msg.width, msg.height));
		} else {
			job.reject(new Error(msg.message));
		}
	});
	worker.addEventListener('error', (event) => {
		const err = new Error(event.message || 'The HEIC decoder failed to load.');
		for (const job of pending.values()) job.reject(err);
		pending.clear();
		worker?.terminate();
		worker = undefined;
	});
	return worker;
}

function decodeHeicInWorker(bytes: Uint8Array): Promise<ImageData> {
	return new Promise((resolve, reject) => {
		const id = nextId++;
		pending.set(id, { resolve, reject });
		const request: DecodeRequest = { id, bytes };
		getWorker().postMessage(request, { transfer: [bytes.buffer as ArrayBuffer] });
	});
}

/** Decode with EXIF orientation applied; older Safari rejects the options bag, so retry bare. */
async function nativeBitmap(file: File): Promise<ImageBitmap> {
	try {
		return await createImageBitmap(file, { imageOrientation: 'from-image' });
	} catch (err) {
		if (err instanceof TypeError) return createImageBitmap(file);
		throw err;
	}
}

/**
 * Decode any supported photo, including HEIC, to an `ImageBitmap`. Throws with a user-readable
 * message when the file is not an image this browser (plus libheif) can open.
 */
export async function decodePhoto(file: File): Promise<ImageBitmap> {
	try {
		return await nativeBitmap(file);
	} catch {
		// Not something this browser reads natively. A HEIF still has a chance below.
	}

	const bytes = new Uint8Array(await file.arrayBuffer());
	if (!isHeif(bytes.subarray(0, SNIFF_BYTES))) {
		throw new Error(`Could not open ${file.name}. Choose a JPG, PNG, WebP, or HEIC photo.`);
	}
	// libheif already applied the file's rotation, so no orientation option here.
	return createImageBitmap(await decodeHeicInWorker(bytes));
}
