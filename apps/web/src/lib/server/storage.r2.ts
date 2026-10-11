/**
 * Photo storage on Cloudflare R2. URLs stored in the DB look like `/photos/<key>` and are served by
 * routes/photos/[...key]. Server-side readers (Gemini) read the bucket directly instead of fetching themselves.
 * Bindings come from `cloudflare:workers` (real in Workers, proxied by the adapter in `vite dev`).
 * Without a bucket binding, falls back to data URLs so the flow still works.
 */
import { env } from 'cloudflare:workers';

const bucket = (): R2Bucket | undefined => (env as { PHOTOS?: R2Bucket }).PHOTOS;

export async function putPhoto(uid: string, file: File): Promise<string> {
	const b = bucket();
	if (!b) {
		const b64 = Buffer.from(await file.arrayBuffer()).toString('base64');
		return `data:${file.type};base64,${b64}`;
	}
	const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[file.type] ?? 'jpg';
	const key = `${uid}/${crypto.randomUUID()}.${ext}`;
	await b.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
	return `/photos/${key}`;
}

export async function getPhoto(
	key: string
): Promise<{ body: ArrayBuffer; contentType: string } | null> {
	const b = bucket();
	if (!b) return null;
	const obj = await b.get(key);
	if (!obj) return null;
	return {
		body: await obj.arrayBuffer(),
		contentType: obj.httpMetadata?.contentType ?? 'image/jpeg'
	};
}
