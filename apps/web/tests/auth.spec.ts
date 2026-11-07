import { test, expect } from '@playwright/test';

/**
 * Account guards and pages. These need no database: guests are redirected before any query runs,
 * and the forms render from public config alone. The full signed-in product is journey.spec.ts.
 */
test('guests are sent to sign in from app pages, with the destination kept', async ({ page }) => {
	await page.goto('/scrapbook');
	await expect(page).toHaveURL(/\/login\?next=%2Fscrapbook$/);
	await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
	// 'commit': the login page may still be fetching the Turnstile script when we leave it.
	await page.goto('/onboarding', { waitUntil: 'commit' });
	await expect(page).toHaveURL(/\/login\?next=%2Fonboarding$/);
});

test('every API answers 401 for guests', async ({ request }) => {
	for (const [method, path] of [
		['POST', '/api/plan'],
		['GET', '/api/taste'],
		['GET', '/api/map?lat=40.7&lng=-74'],
		['GET', '/api/photo?name=places/x/photos/y']
	] as const) {
		const res = await request.fetch(path, { method, data: method === 'POST' ? {} : undefined });
		expect(res.status(), `${method} ${path}`).toBe(401);
		expect((await res.json()).message).toMatch(/sign in/i);
	}
});

test('photos are private to their owner', async ({ request }) => {
	const res = await request.get('/photos/00000000-0000-0000-0000-000000000000/x.jpg', {
		maxRedirects: 0
	});
	expect(res.status()).toBe(303);
	expect(res.headers().location).toMatch(/^\/login/);
});

test('sign-up form asks only for an email, with the Turnstile widget and the sign-in link', async ({
	page
}) => {
	await page.goto('/signup');
	await expect(page.getByRole('heading', { name: 'Make it yours.' })).toBeVisible();
	await expect(page.getByLabel('Email')).toBeVisible();
	await expect(page.getByLabel('Password')).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Send me a link' })).toBeDisabled();
	await expect(page.locator('.turnstile')).toBeVisible();
	await expect(page.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
		true
	);
});

test('the password step needs the session the emailed link creates', async ({ page }) => {
	await page.goto('/signup/password', { waitUntil: 'commit' });
	await expect(page).toHaveURL(/\/signup$/);
});

test('guests land on the welcome page with the way in', async ({ page }) => {
	await page.goto('/');
	await expect(page).toHaveURL(/\/welcome$/);
	await expect(page.getByRole('link', { name: 'Create your account' })).toHaveAttribute(
		'href',
		'/signup'
	);
	await expect(page.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
		true
	);
});

test('GET /signout never ends a session, it just goes home', async ({ page }) => {
	await page.goto('/signout');
	await expect(page).toHaveURL(/\/welcome$/);
});
