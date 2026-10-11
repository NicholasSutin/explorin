/**
 * Local-disk photo storage for `vite dev` / adapter-node. Same API as storage.r2.ts.
 * Files live in .photos/ (gitignored); URLs look like `/photos/<key>` and are served by routes/photos/[...key].
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';

const ROOT = resolve(process.cwd(), '.photos');

export const hasBucket = () => true;

export async function putPhoto(uid: string, file: File): Promise<string> {
	const ext = file.type.split('/')[1] || 'jpg';
	const key = `${uid}/${crypto.randomUUID()}.${ext}`;
	const path = join(ROOT, key);
	await mkdir(join(ROOT, uid), { recursive: true });
	await writeFile(path, Buffer.from(await file.arrayBuffer()));
	return `/photos/${key}`;
}

export async function getPhoto(
	key: string
): Promise<{ body: ArrayBuffer; contentType: string } | null> {
	const path = resolve(ROOT, key);
	if (!path.startsWith(ROOT + sep)) return null; // no path traversal
	try {
		const buf = await readFile(path);
		const ext = key.split('.').pop()?.toLowerCase() ?? 'jpeg';
		const contentType =
			ext === 'png'
				? 'image/png'
				: ext === 'webp'
					? 'image/webp'
					: ext === 'heic'
						? 'image/heic'
						: 'image/jpeg';
		return {
			body: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
			contentType
		};
	} catch {
		return null;
	}
}
