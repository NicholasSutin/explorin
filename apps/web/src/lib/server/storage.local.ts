/**
 * Local-disk photo storage for `vite dev` / adapter-node. Same API as storage.r2.ts.
 * Files live in .photos/ (gitignored); URLs look like `/photos/<key>` and are served by routes/photos/[...key].
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';

const ROOT = resolve(process.cwd(), '.photos');

const EXT: Record<string, string> = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp'
};

export async function putPhoto(uid: string, file: File): Promise<string> {
	const key = `${uid}/${crypto.randomUUID()}.${EXT[file.type] ?? 'jpg'}`;
	const path = resolve(ROOT, key);
	if (!path.startsWith(ROOT + sep)) throw new Error('Bad photo key');
	await mkdir(resolve(ROOT, uid), { recursive: true });
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

/** Remove every photo this person uploaded (account deletion). */
export async function deletePhotos(uid: string): Promise<number> {
	const { readdir, rm } = await import('node:fs/promises');
	const dir = resolve(ROOT, uid);
	if (!dir.startsWith(ROOT + sep) || !/^[0-9a-f-]{36}$/i.test(uid)) return 0;
	const count = await readdir(dir)
		.then((f) => f.length)
		.catch(() => 0);
	await rm(dir, { recursive: true, force: true });
	return count;
}
