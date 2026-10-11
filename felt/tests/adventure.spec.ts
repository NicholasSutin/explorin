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
	await page.getByRole('button', { name: 'Try the NYC demo' }).click();
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
	await page
		.locator('#photos')
		.setInputFiles({
			name: 'memory.png',
			mimeType: 'image/png',
			buffer: Buffer.from(image, 'base64')
		});
	await page.getByRole('checkbox', { name: /Let this story/ }).check();
	await page.getByRole('button', { name: /Create my scrapbook/ }).click();
	await expect(page.getByRole('heading', { name: 'Your little keepsake.' })).toBeVisible();
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
	await expect(page.locator('.scrapbook-story')).toContainText('I felt peaceful');
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
	const scrapbook = await request.post('/api/scrapbook', {
		data: { title: 'A walk', location: 'New York City', reflections: ['A quiet moment'] }
	});
	expect(scrapbook.ok()).toBe(true);
	const book = await scrapbook.json();
	expect(typeof book.aiGenerated).toBe('boolean');
	expect(book.title.length).toBeGreaterThan(0);
});
