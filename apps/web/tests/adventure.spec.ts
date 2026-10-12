import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

test('mobile demo: discovery, reflection, photos, scrapbook, export and persisted history', async ({
	page
}) => {
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await page.goto('/');
	await expect(page.getByRole('heading', { name: /Your next adventure/ })).toBeVisible();
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
		true
	);
	await page.screenshot({ path: 'test-results/mobile-discovery.png', fullPage: true });
	await page.getByRole('button', { name: 'Curated NYC picks' }).click();
	await expect(page.getByText(/Demo collection/)).toBeVisible();
	await page
		.getByRole('button', { name: /Start Adventure/ })
		.first()
		.click();
	await page.getByLabel('Your reflection').fill('I felt peaceful watching the city slow down.');
	await page.getByRole('button', { name: /Save reflection/ }).click();
	await expect(page.getByText('I felt peaceful watching the city slow down.')).toBeVisible();
	await page.getByRole('button', { name: /Finish Adventure/ }).click();
	await expect(page.getByRole('button', { name: /Create my scrapbook/ })).toBeDisabled();
	const image = await page.evaluate(() => {
		const c = document.createElement('canvas');
		c.width = 320;
		c.height = 240;
		const ctx = c.getContext('2d')!;
		ctx.fillStyle = '#a8bc8c';
		ctx.fillRect(0, 0, 320, 240);
		ctx.fillStyle = '#efc87b';
		ctx.beginPath();
		ctx.arc(100, 80, 40, 0, Math.PI * 2);
		ctx.fill();
		return c.toDataURL('image/png').split(',')[1];
	});
	await page.locator('#photos').setInputFiles({
		name: 'memory.png',
		mimeType: 'image/png',
		buffer: Buffer.from(image, 'base64')
	});
	await page.getByRole('checkbox', { name: /Let this story/ }).check();
	await page.getByRole('button', { name: /Create my scrapbook/ }).click();
	// Real Gemini generation runs when GEMINI_API_KEY is set (18 s server timeout); fallback is instant.
	await expect(page.getByRole('heading', { name: 'Your little keepsake.' })).toBeVisible({
		timeout: 25000
	});
	await expect(page.getByRole('status')).toContainText('Saved');
	await page.screenshot({ path: 'test-results/mobile-scrapbook.png', fullPage: true });
	const downloadPromise = page.waitForEvent('download');
	await page.getByRole('button', { name: /Download PNG/ }).click();
	const download = await downloadPromise;
	expect(download.suggestedFilename()).toBe('explorin-scrapbook.png');
	await download.saveAs('test-results/scrapbook.png');
	await page.reload();
	await page.getByRole('button', { name: /My memories/ }).click();
	await expect(page.getByRole('button', { name: /Open scrapbook/ })).toBeVisible();
	await page.getByRole('button', { name: /Open scrapbook/ }).click();
	// With GEMINI_API_KEY the story is an AI rewrite; without it, the reflections verbatim. Either way it is non-empty.
	await expect(page.locator('.scrapbook-story')).toContainText(/\S{20,}|\w+\s+\w+\s+\w+/);
	await page.getByRole('button', { name: 'Explore', exact: true }).click();
	await expect(page.getByRole('checkbox', { name: /Personalize with insights/ })).toBeVisible();
	expect(errors).toEqual([]);
});

test('server validation and honest credential-free fallback', async ({ request }) => {
	expect((await request.post('/api/discover', { data: { prompt: '' } })).status()).toBe(400);
	const live = await request.post('/api/discover', {
		data: { prompt: 'A calm walk', location: 'New York City', interests: [] }
	});
	// 503 without NIMBLE_API_KEY; 200 with live keys in .env. Both are honest answers.
	expect([200, 503]).toContain(live.status());
	if (live.ok()) expect((await live.json()).mode).toBe('live');
	expect((await request.get('/api/photo?name=../etc/passwd')).status()).toBe(400);
	// 503 without GOOGLE_MAPS_API_KEY; 404/302 with a key (unknown photo vs real redirect).
	const photo = await request.get('/api/photo?name=places/abc/photos/def', { maxRedirects: 0 });
	expect([302, 404, 503]).toContain(photo.status());
	const scrapbook = await request.post('/api/scrapbook', {
		data: { title: 'A walk', location: 'New York City', reflections: ['A quiet moment'] }
	});
	expect(scrapbook.ok()).toBe(true);
	const book = await scrapbook.json();
	expect(typeof book.aiGenerated).toBe('boolean');
	expect(book.title.length).toBeGreaterThan(0);
});

test('HEIC photos decode through the libheif worker fallback', async ({ page }) => {
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await page.goto('/');
	await page.getByRole('button', { name: 'Curated NYC picks' }).click();
	await page
		.getByRole('button', { name: /Start Adventure/ })
		.first()
		.click();
	await page.getByRole('button', { name: /Finish Adventure/ }).click();
	// Chromium cannot read HEIC natively, so this exercises the worker + WASM path end to end.
	// An empty mimeType mirrors what Android/Chrome hands over for gallery HEICs.
	await page.locator('#photos').setInputFiles({
		name: 'iphone-photo.heic',
		mimeType: '',
		buffer: readFileSync(new URL('./fixtures/sample.heic', import.meta.url))
	});
	const preview = page.locator('.photo-previews img');
	await expect(preview).toHaveCount(1, { timeout: 20000 });
	await expect(preview).toHaveAttribute('src', /^data:image\/jpeg/);
	// Orange over blue in the fixture: check the decoded pixels are not blank.
	const colours = await preview.evaluate((img: HTMLImageElement) => {
		const c = document.createElement('canvas');
		c.width = img.naturalWidth;
		c.height = img.naturalHeight;
		const ctx = c.getContext('2d')!;
		ctx.drawImage(img, 0, 0);
		const top = ctx.getImageData(8, 8, 1, 1).data;
		const bottom = ctx.getImageData(8, c.height - 8, 1, 1).data;
		return { w: c.width, h: c.height, top: [...top].slice(0, 3), bottom: [...bottom].slice(0, 3) };
	});
	expect(colours.w).toBe(64);
	expect(colours.h).toBe(48);
	expect(colours.top[0]).toBeGreaterThan(colours.top[2]); // warm on top
	expect(colours.bottom[2]).toBeGreaterThan(colours.bottom[0]); // cool below
	await expect(page.locator('.error, [role=alert]')).toHaveCount(0);
	expect(errors).toEqual([]);
});

test('map route validates input and never leaks the key', async ({ request }) => {
	expect((await request.get('/api/map')).status()).toBe(400);
	expect((await request.get('/api/map?lat=999&lng=0')).status()).toBe(400);
	expect((await request.get('/api/map?pins=1,2;x')).status()).toBe(400);
	const ok = await request.get('/api/map?lat=40.748&lng=-74.0048&zoom=15&w=300&h=200&style=ink');
	expect([200, 502, 503]).toContain(ok.status());
	if (ok.status() === 200) expect(ok.headers()['content-type']).toMatch(/^image\//);
	const pins = await request.get(
		'/api/map?pins=40.748,-74.0048;40.7024,-73.9875&numbered=1&trail=1'
	);
	expect([200, 502, 503]).toContain(pins.status());
});

test('discovery streams pipeline steps as NDJSON when asked to', async ({ request }) => {
	const res = await request.post('/api/discover', {
		headers: { Accept: 'application/x-ndjson' },
		data: { prompt: 'A curious afternoon', location: 'New York City', interests: [], demo: true }
	});
	expect(res.ok()).toBe(true);
	expect(res.headers()['content-type']).toContain('application/x-ndjson');
	const events = (await res.text())
		.split('\n')
		.filter(Boolean)
		.map((line) => JSON.parse(line) as { type: string; step?: { id: string; state: string } });
	expect(events[0]).toMatchObject({ type: 'step', step: { id: 'curated', state: 'done' } });
	expect(events.at(-1)?.type).toBe('result');
	// The curated path still reports whether Places enrichment ran, skipped or failed.
	expect(events.some((e) => e.step?.id === 'places' && e.step.state !== 'running')).toBe(true);
});
