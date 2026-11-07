import { readFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';

/**
 * The whole product, signed up from scratch: email link -> password -> about you -> tier list -> plan a day
 * (real Nimble, Gemini and Places calls) -> map -> check in -> finish with a note, photo and "best for" tags ->
 * scrapbook -> share image -> settings usage and learned phrases -> delete the account (which also cleans up
 * after the test).
 *
 * Needs a dev server started with Cloudflare's Turnstile test keys and no RESEND_API_KEY, its output in a file
 * (the sign-up link is printed there), and E2E_SERVER_LOG pointing at that file:
 *   TURNSTILE_SITE_KEY=1x00000000000000000000AA TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA \
 *   TURNSTILE_HOSTNAMES= RESEND_API_KEY= npx vite dev --host 127.0.0.1 --port 4173 > /tmp/dev.log 2>&1 &
 *   E2E_SERVER_LOG=/tmp/dev.log node ../../node_modules/@playwright/test/cli.js test tests/journey.spec.ts
 * The map is a stand-in Maps API unless E2E_REAL_MAPS=1, which loads Google's with GOOGLE_MAPS_BROWSER_KEY
 * (its website restrictions must allow http://127.0.0.1:4173/*).
 */
const REAL_MAPS = !!process.env.E2E_REAL_MAPS;
const LOG = process.env.E2E_SERVER_LOG;
test.skip(!LOG, 'Set E2E_SERVER_LOG to the dev server log (see the comment above).');
test.setTimeout(240_000);
// Standing by the High Line, so "start near me" and check-ins have a position.
test.use({
	geolocation: { latitude: 40.748, longitude: -74.0048 },
	permissions: ['geolocation'],
	// E2E_DESKTOP=1 runs the same journey at laptop size (side panel, book spreads, centred dialogs).
	...(process.env.E2E_DESKTOP ? { viewport: { width: 1280, height: 860 } } : {})
});

async function magicLink(email: string): Promise<string> {
	const pattern = new RegExp(`to ${email.replace(/[.+]/g, '\\$&')}: [^\\n]*\\n(\\S+)`);
	for (let i = 0; i < 40; i++) {
		const m = readFileSync(LOG!, 'utf8').match(pattern);
		if (m) return m[1];
		await new Promise((r) => setTimeout(r, 250));
	}
	throw new Error('No sign-up link in the server log');
}

/** Screenshot and export paths, kept apart for the phone and desktop runs. */
const shot = (name: string) =>
	`test-results/journey${process.env.E2E_DESKTOP ? '-desktop' : ''}-${name}`;

const noOverflow = (page: Page) =>
	page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

test('sign up, taste, plan, walk, reflect, scrapbook, share, settings, delete', async ({
	page
}) => {
	if (!REAL_MAPS) await page.addInitScript({ path: 'tests/fixtures/fake-google-maps.js' });
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	// Third-party warnings (Maps key restrictions, Turnstile) are reported, not failed on.
	page.on(
		'console',
		(m) => m.type() === 'error' && console.log('[browser]', m.text().slice(0, 200))
	);

	// 1. Sign up with an emailed link, then a password.
	const email = `e2e+${Date.now()}@explorin.test`;
	await page.goto('/');
	await expect(page).toHaveURL(/\/welcome$/);
	await page.screenshot({ path: shot('01-welcome.png'), fullPage: true });
	await page.getByRole('link', { name: 'Create your account' }).click();
	await page.getByLabel('Email').fill(email);
	await expect(page.getByRole('button', { name: 'Send me a link' })).toBeEnabled({
		timeout: 20_000
	});
	await page.getByRole('button', { name: 'Send me a link' }).click();
	await expect(page.getByRole('heading', { name: 'Check your inbox.' })).toBeVisible();
	await page.goto(await magicLink(email));
	await expect(page).toHaveURL(/\/signup\/password/);
	await page.getByRole('textbox', { name: /^Password/ }).fill('correct horse battery');
	await page.getByLabel('Repeat it').fill('correct horse battery');
	await page.getByRole('button', { name: 'Save and continue' }).click();

	// 2. About you.
	await expect(page).toHaveURL(/\/onboarding$/);
	await page.getByLabel('What should we call you?').fill('Robin');
	await page
		.getByLabel(/what do you like to explore/i)
		.fill(
			'Slow mornings, a really good pastry, hidden courtyards and a long walk that ends with a view.'
		);
	for (const chip of ['Coffee & sweets', 'Hidden gems', 'Architecture'])
		await page.getByText(chip, { exact: true }).click();
	await page.getByText('Young adults', { exact: true }).click();
	expect(await noOverflow(page)).toBe(true);
	await page.screenshot({ path: shot('02-about.png'), fullPage: true });
	await page.getByRole('button', { name: /Next: your taste/ }).click();

	// 3. Tier list: grade the cards it chose for us.
	await expect(page).toHaveURL(/\/onboarding\/taste$/, { timeout: 30_000 });
	await expect(page.getByRole('heading', { name: 'Grade what you love.' })).toBeVisible();
	// The grade buttons sit above the fixed bottom bar without scrolling, at phone and laptop size.
	const gradeBox = await page.getByRole('group', { name: /^Grade / }).boundingBox();
	const barBox = await page.getByRole('button', { name: /^Grade \d+ more/ }).boundingBox();
	expect(gradeBox!.y + gradeBox!.height).toBeLessThanOrEqual(barBox!.y - 40);
	await page.screenshot({ path: shot('03-tierlist.png'), fullPage: true });
	// Every grade must be saved on the card it was given to, not the next one in the queue.
	const sent: Record<string, string>[] = [];
	const onTaste = (r: import('@playwright/test').Request) => {
		if (r.method() === 'POST' && new URL(r.url()).pathname === '/api/taste')
			sent.push(r.postDataJSON().grades);
	};
	page.on('request', onTaste);
	const graded: string[] = [];
	const grades = ['S+', 'A+', 'NO', 'A', 'B', 'S+', 'C'];
	for (const g of grades) {
		const group = page.getByRole('group', { name: /^Grade / });
		if (!(await group.isVisible())) break;
		graded.push((await group.getAttribute('aria-label'))!.replace(/^Grade /, ''));
		await group.getByRole('button', { name: new RegExp(`^${g.replace('+', '\\+')},`) }).click();
		await page.waitForTimeout(260);
	}
	await page.screenshot({ path: shot('04-tierboard.png'), fullPage: true });
	await page.getByRole('button', { name: 'Start planning →' }).click();
	await expect(page).toHaveURL(/\/$/);
	page.off('request', onTaste);
	const saved = Object.assign({}, ...sent) as Record<string, string>;
	expect(Object.keys(saved)).not.toContain('null');
	expect(Object.keys(saved)).toHaveLength(graded.length);

	// 4. Plan a day.
	await expect(page).toHaveURL(/\/$/);
	await expect(page.getByRole('heading', { name: 'What’s the plan today?' })).toBeVisible();
	expect(await noOverflow(page)).toBe(true);
	await page.screenshot({ path: shot('05-home.png'), fullPage: true });
	// Chromium drops the emulated position somewhere in the sign-up flow (the Turnstile frame); set it again.
	await page.context().setGeolocation({ latitude: 40.748, longitude: -74.0048 });
	await page
		.getByLabel('Describe your day')
		.fill('A slow afternoon in Chelsea with a great pastry, a little art and a view of the river');
	// Afternoon: today's, or tomorrow's once it has passed, so permitted NYC events are likely nearby.
	await page.getByText('Afternoon', { exact: true }).click();
	await page.getByRole('button', { name: /Plan my day/ }).click();
	await expect(page.getByText('Building your day')).toBeVisible();
	await expect(page.getByText('Starting the route near you')).toBeVisible();
	await expect(page.getByText('Reading your taste')).toBeVisible({ timeout: 10_000 });
	await page.waitForTimeout(4000);
	await page.screenshot({ path: shot('06-planning.png'), fullPage: true });
	await expect(page).toHaveURL(/\/trip\/[0-9a-f-]{36}$/, { timeout: 120_000 });

	// 5. The trip: pins on the map, open a stop, check in, open the list, finish.
	await expect(page.getByLabel('Trip details')).toBeVisible();
	const pins = page.locator('.xm-stop');
	await expect(pins.first()).toBeVisible({ timeout: 10_000 });
	expect(await pins.count()).toBeGreaterThanOrEqual(3);
	if (REAL_MAPS) {
		// The trip page swaps to the static map on a key error, which it checks for after 4s.
		await page.waitForTimeout(5000);
		await expect(page.locator('.gm-err-container')).toHaveCount(0);
		await expect(pins.first()).toBeVisible();
	} else {
		expect(
			await page.evaluate(
				() => (window as unknown as { __fakeTrail?: unknown[] }).__fakeTrail?.length ?? 0
			)
		).toBeGreaterThanOrEqual(3);
		await page.waitForTimeout(1500);
	}
	await page.screenshot({ path: shot('07-trip.png') });
	// The "you're here" banner can sit over the pin you're standing at; the pin's own handler is what matters.
	await pins.first().dispatchEvent('click');
	await expect(pins.first()).toHaveClass(/is-selected/);
	await expect(page.getByRole('link', { name: /Google Maps/ }).first()).toBeVisible();
	await expect(page.getByRole('link', { name: /Apple Maps/ }).first()).toHaveAttribute(
		'href',
		/^https:\/\/maps\.apple\.com\/\?daddr=/
	);
	if (!process.env.E2E_DESKTOP) await page.getByRole('button', { name: 'Expand details' }).click();
	// The stop's Google photo (through /api/photo) renders.
	const photo = page.getByLabel('Trip details').locator('figure img').first();
	await expect
		.poll(() => photo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth), {
			timeout: 10_000
		})
		.toBeGreaterThan(0);
	await page.screenshot({ path: shot('08-stop.png') });
	await page.getByRole('button', { name: 'I’m here' }).click();
	await expect(page.getByText(/Checked in/)).toBeVisible();
	await page.getByRole('button', { name: 'Close' }).click();
	await page.screenshot({ path: shot('09-list.png') });
	const tripUrl = page.url();
	await page.goto(`${tripUrl}/done`);
	await page.waitForLoadState('networkidle'); // the photo input needs its handler attached

	// 6. Reflect: note, a photo, the highlight; then pick who it's best for.
	await page
		.getByLabel('Your note')
		.fill(
			'The croissant was flaky perfection. Got a little lost by the river and didn’t mind at all. I always pick walking over the subway.'
		);
	const png = await page.evaluate(() => {
		const c = document.createElement('canvas');
		c.width = 480;
		c.height = 360;
		const ctx = c.getContext('2d')!;
		ctx.fillStyle = '#a8bc8c';
		ctx.fillRect(0, 0, 480, 360);
		ctx.fillStyle = '#efc87b';
		ctx.beginPath();
		ctx.arc(150, 110, 60, 0, Math.PI * 2);
		ctx.fill();
		return c.toDataURL('image/png').split(',')[1];
	});
	await page.locator('input[type=file]').setInputFiles({
		name: 'river.png',
		mimeType: 'image/png',
		buffer: Buffer.from(png, 'base64')
	});
	await expect(page.getByAltText('Photo 1')).toBeVisible();
	await page.screenshot({ path: shot('10-note.png'), fullPage: true });
	await page.getByRole('button', { name: 'Next' }).click();
	await expect(page.getByRole('heading', { name: 'Who’s this day best for?' })).toBeVisible({
		timeout: 45_000
	});
	const options = page.getByRole('group', { name: 'Best for' }).getByRole('button');
	expect(await options.count()).toBe(6);
	// Nothing is picked for them; the first tap picks.
	await expect(page.getByText('0 of 3 picked')).toBeVisible();
	await options.nth(0).click();
	await options.nth(2).click();
	await expect(options.nth(0)).toHaveAttribute('aria-pressed', 'true');
	await expect(page.getByText('2 of 3 picked')).toBeVisible();
	// Phrases the note reveals about them (AI output, so possibly none). Opt-in: keep the first, skip the rest.
	const remember = page.getByRole('region', { name: 'Explorin can remember' });
	const offered = (await remember.isVisible())
		? (await remember.getByRole('button').allInnerTexts()).map((t) => t.trim())
		: [];
	console.log('[journey] the note suggested:', offered);
	if (offered.length) {
		const first = remember.getByRole('button', { name: offered[0], exact: true });
		await first.click();
		await expect(first).toHaveAttribute('aria-pressed', 'true');
	}
	await page.screenshot({ path: shot('11-bestfor.png'), fullPage: true });
	await page.getByRole('button', { name: 'Save to my scrapbook' }).click();

	// 7. Scrapbook opens at the new page with the share sheet.
	await expect(page).toHaveURL(/\/scrapbook\/[0-9a-f-]{36}/);
	const dialog = page.getByRole('dialog', { name: 'Share this day' });
	await expect(dialog).toBeVisible({ timeout: 10_000 });
	await expect(dialog.getByAltText('Your page as it will be shared')).toBeVisible({
		timeout: 30_000
	});
	await page.screenshot({ path: shot('12-share.png') });
	const download = page.waitForEvent('download');
	await dialog.getByRole('button', { name: /Download image|Save to Files/ }).click();
	await (await download).saveAs(shot('story.png'));
	await dialog.getByRole('radio', { name: /Page/ }).click();
	await expect(dialog.getByAltText('Your page as it will be shared')).toBeVisible({
		timeout: 30_000
	});
	const pageDownload = page.waitForEvent('download');
	await dialog.getByRole('button', { name: /Download image|Save to Files/ }).click();
	await (await pageDownload).saveAs(shot('page.png'));
	await dialog.getByRole('button', { name: 'Close' }).click();
	// The new day is the one in view: its Share button and map link are there without turning a page.
	await expect(page.getByRole('button', { name: 'Share' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'See this day on the map' })).toHaveAttribute(
		'href',
		new URL(tripUrl).pathname
	);
	await page.screenshot({ path: shot('13-book.png') });
	// Back one: the contents on a phone; on a laptop, with one day saved, the closed book. Closed, it is just
	// its cover, centred, with no empty left page beside it.
	await page.getByRole('button', { name: 'Previous page' }).click();
	if (process.env.E2E_DESKTOP) await expect(page.getByText(/^Cover \//)).toBeVisible();
	await page.waitForTimeout(900);
	await page.screenshot({ path: shot('14-back.png') });

	// 8. Settings: usage was recorded; then delete everything.
	await page.goto('/settings');
	await expect(page.getByText('Credits used in')).toBeVisible();
	await expect(page.getByText(/Nimble web search|Google Places|Gemini/).first()).toBeVisible();
	const learnedList = page.getByRole('region', { name: 'Learned from your trips' });
	if (offered.length) {
		const [phrase, skipped] = offered;
		// The kept phrase is merged after the finish response; reload until it has landed.
		await expect
			.poll(
				async () => {
					await page.reload();
					return learnedList.getByText(phrase, { exact: true }).count();
				},
				{ timeout: 20_000 }
			)
			.toBe(1);
		if (skipped) await expect(learnedList.getByText(skipped, { exact: true })).toHaveCount(0);
		await learnedList.getByRole('button', { name: `Forget “${phrase}”` }).click();
		await expect(learnedList.getByText(phrase, { exact: true })).toHaveCount(0);
	} else await expect(learnedList.getByText(/Nothing yet/)).toBeVisible();
	await page.screenshot({ path: shot('15-settings.png'), fullPage: true });
	await page.getByLabel('Type DELETE to confirm').fill('DELETE');
	await page.getByRole('button', { name: 'Delete my account' }).click();
	await expect(page).toHaveURL(/\/welcome\?deleted=1/);
	await expect(page.getByText('has been deleted')).toBeVisible();
	await page.goto('/scrapbook');
	await expect(page).toHaveURL(/\/login/);

	expect(errors).toEqual([]);
});
