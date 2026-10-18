/** Browser-side helpers: API calls and EXIF-stripping image re-encode. */
import { decodePhoto } from './heic';
import type { LatLng } from './adventure';

/** Pull the server's message out of a failed response; SvelteKit's `error()` answers `{ message }`. */
export async function errorMessage(
	res: Response,
	fallback = 'Something went wrong. Please try again.'
) {
	try {
		return ((await res.json()) as { message?: string }).message || fallback;
	} catch {
		return fallback;
	}
}

export async function api<T>(
	path: string,
	init: RequestInit & { json?: unknown; timeoutMs?: number } = {}
): Promise<T> {
	const { json: body, timeoutMs, ...rest } = init;
	const res = await fetch(path, {
		...rest,
		headers:
			body !== undefined
				? { 'Content-Type': 'application/json', ...(rest.headers ?? {}) }
				: rest.headers,
		body: body !== undefined ? JSON.stringify(body) : rest.body,
		signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : rest.signal
	});
	if (!res.ok) throw new Error(await errorMessage(res, res.statusText));
	return res.json() as Promise<T>;
}

/**
 * Re-encode through a canvas: drops EXIF (including GPS), shrinks large photos, and turns HEIC
 * into JPEG so the server and the AI only ever see one format. Throws if the file is not an image
 * this browser can open.
 */
export async function reencodePhoto(
	file: File,
	{ maxEdge = 1600, quality = 0.85 }: { maxEdge?: number; quality?: number } = {}
): Promise<Blob> {
	const bmp = await decodePhoto(file);
	const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
	const canvas = document.createElement('canvas');
	canvas.width = Math.round(bmp.width * scale);
	canvas.height = Math.round(bmp.height * scale);
	const context = canvas.getContext('2d');
	if (!context) {
		bmp.close();
		throw new Error('Your browser could not process this photo.');
	}
	context.drawImage(bmp, 0, 0, canvas.width, canvas.height);
	bmp.close();
	const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', quality));
	if (!blob) throw new Error(`Could not process ${file.name}.`);
	return blob;
}

/** `reencodePhoto` as an upload-ready JPEG File. */
export async function stripAndResize(file: File, maxEdge = 1600): Promise<File> {
	const blob = await reencodePhoto(file, { maxEdge });
	return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
}

/** `reencodePhoto` as a JPEG data URL, for histories kept in localStorage. */
export async function photoDataUrl(file: File, maxEdge = 1200, quality = 0.72): Promise<string> {
	const blob = await reencodePhoto(file, { maxEdge, quality });
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result));
		reader.onerror = () => reject(reader.error);
		reader.readAsDataURL(blob);
	});
}

export async function uploadPhotos(files: File[]): Promise<string[]> {
	const form = new FormData();
	for (const f of await Promise.all(files.map((f) => stripAndResize(f)))) form.append('files', f);
	const { urls } = await api<{ urls: string[] }>('/api/upload', { method: 'POST', body: form });
	return urls;
}

/** POST and read newline-delimited JSON events as they arrive (the planner's progress stream). */
export async function streamApi(
	path: string,
	body: unknown,
	onEvent: (event: Record<string, unknown>) => void,
	timeoutMs = 90000
): Promise<void> {
	const res = await fetch(path, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' },
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(timeoutMs)
	});
	if (!res.ok || !res.body) throw new Error(await errorMessage(res));
	const reader = res.body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';
	for (;;) {
		const { value, done } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });
		let i: number;
		while ((i = buffer.indexOf('\n')) >= 0) {
			const line = buffer.slice(0, i).trim();
			buffer = buffer.slice(i + 1);
			if (line) onEvent(JSON.parse(line));
		}
	}
	if (buffer.trim()) onEvent(JSON.parse(buffer));
}

export function getLocation(timeoutMs = 2500): Promise<{ lat: number; lng: number } | null> {
	return new Promise((resolve) => {
		if (!('geolocation' in navigator)) return resolve(null);
		const t = setTimeout(() => resolve(null), timeoutMs);
		navigator.geolocation.getCurrentPosition(
			(p) => {
				clearTimeout(t);
				resolve({ lat: p.coords.latitude, lng: p.coords.longitude });
			},
			() => {
				clearTimeout(t);
				resolve(null);
			},
			{ timeout: timeoutMs, maximumAge: 600000 }
		);
	});
}

export interface Fix extends LatLng {
	accuracy: number;
	at: number;
}

/**
 * Follow the device position while the page is open. Restarts when the page becomes visible again (iOS stops
 * the watch while Safari is in the background, e.g. while Apple Maps has the screen). Returns a stop function.
 */
export function watchLocation(
	onFix: (fix: Fix) => void,
	onError: (message: string) => void
): () => void {
	if (!('geolocation' in navigator)) {
		onError('Location is not available in this browser.');
		return () => {};
	}
	let id: number | null = null;
	const start = () => {
		if (id !== null) navigator.geolocation.clearWatch(id);
		id = navigator.geolocation.watchPosition(
			(p) =>
				onFix({
					lat: p.coords.latitude,
					lng: p.coords.longitude,
					accuracy: p.coords.accuracy,
					at: p.timestamp
				}),
			(e) =>
				onError(
					e.code === e.PERMISSION_DENIED
						? 'Location is off for Explorin. Turn it on in your browser settings to follow along.'
						: 'Could not get your location right now.'
				),
			{ enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
		);
	};
	const onVisible = () => document.visibilityState === 'visible' && start();
	start();
	document.addEventListener('visibilitychange', onVisible);
	return () => {
		if (id !== null) navigator.geolocation.clearWatch(id);
		document.removeEventListener('visibilitychange', onVisible);
	};
}

/** Apple devices get Apple Maps first in the hand-off. iPadOS reports itself as a Mac with touch. */
export const prefersAppleMaps = () =>
	/iPhone|iPad|iPod/.test(navigator.userAgent) ||
	(/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
