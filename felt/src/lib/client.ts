/** Browser-side helpers: API calls and EXIF-stripping image re-encode. */
import { decodePhoto } from './heic';
import type { Profile, RecommendResponse, ReflectionAnalysis } from './types';

export async function api<T>(
	path: string,
	init: RequestInit & { json?: unknown } = {}
): Promise<T> {
	const { json: body, ...rest } = init;
	const res = await fetch(path, {
		...rest,
		headers:
			body !== undefined
				? { 'Content-Type': 'application/json', ...(rest.headers ?? {}) }
				: rest.headers,
		body: body !== undefined ? JSON.stringify(body) : rest.body
	});
	if (!res.ok) {
		let msg = res.statusText;
		try {
			msg = ((await res.json()) as { message?: string }).message ?? msg;
		} catch {
			/* ignore */
		}
		throw new Error(msg);
	}
	return res.json() as Promise<T>;
}

/**
 * Re-encode through a canvas: drops EXIF (including GPS), shrinks large photos, and turns HEIC
 * into JPEG so the server and the AI only ever see one format. Throws if the file is not an image
 * this browser can open.
 */
export async function stripAndResize(file: File, maxEdge = 1600): Promise<File> {
	const bmp = await decodePhoto(file);
	const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
	const canvas = document.createElement('canvas');
	canvas.width = Math.round(bmp.width * scale);
	canvas.height = Math.round(bmp.height * scale);
	canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
	bmp.close();
	const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
	if (!blob) throw new Error(`Could not process ${file.name}.`);
	return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
}

export async function uploadPhotos(files: File[]): Promise<string[]> {
	const form = new FormData();
	for (const f of files) form.append('files', await stripAndResize(f));
	const { urls } = await api<{ urls: string[] }>('/api/upload', { method: 'POST', body: form });
	return urls;
}

export const createProfile = (name: string, photoUrls: string[], bio?: string) =>
	api<{ profile: Profile }>('/api/profile', { method: 'POST', json: { name, photoUrls, bio } });

export const getProfile = () => api<{ profile: Profile | null }>('/api/profile');

export const recommend = (prompt: string, lat?: number, lng?: number) =>
	api<RecommendResponse>('/api/recommend', { method: 'POST', json: { prompt, lat, lng } });

export const startExperience = (experienceId: string) =>
	api<{ id: string; started_at: string }>('/api/experience', {
		method: 'POST',
		json: { experienceId }
	});

export const finishExperience = (experienceId: string) =>
	api<{ id: string; started_at: string; finished_at: string }>('/api/experience', {
		method: 'PATCH',
		json: { experienceId }
	});

export const reflect = (
	experienceId: string,
	text: string,
	photoUrls: string[],
	consent: boolean
) =>
	api<ReflectionAnalysis & { reflection_id: string; profile: Profile | null }>('/api/reflect', {
		method: 'POST',
		json: { experienceId, text, photoUrls, consent }
	});

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

/** Keep the last results in sessionStorage so /go and /reflect can show place names without a round trip. */
const KEY = 'felt:lastCards';
export function saveCards(r: RecommendResponse) {
	try {
		sessionStorage.setItem(KEY, JSON.stringify(r));
	} catch {
		/* ignore */
	}
}
export function loadCards(): RecommendResponse | null {
	try {
		return JSON.parse(sessionStorage.getItem(KEY) ?? 'null');
	} catch {
		return null;
	}
}
