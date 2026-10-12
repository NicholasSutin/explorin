import { test, expect } from '@playwright/test';

/**
 * Account guards and pages. These need no database: guests are redirected before any query runs,
 * and the forms render from public config alone. The real sign-up flow needs Postgres and is
 * smoke-tested by hand (see MVP.md).
 */
test('guests are sent to sign in from account pages, with the destination kept', async ({
	page
}) => {
	await page.goto('/ask');
	await expect(page).toHaveURL(/\/login\?next=%2Fask$/);
	await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
	// 'commit': the login page may still be fetching the Turnstile script when we leave it.
	await page.goto('/onboarding', { waitUntil: 'commit' });
	await expect(page).toHaveURL(/\/login\?next=%2Fonboarding$/);
});

test('per-account write APIs answer 401 for guests', async ({ request }) => {
	const res = await request.post('/api/profile', {
		data: { name: 'x', photoUrls: ['data:image/jpeg;base64,AA'] }
	});
	expect(res.status()).toBe(401);
	expect((await res.json()).message).toMatch(/sign in/i);
});

test('sign-up form renders with the Turnstile widget and the sign-in link', async ({ page }) => {
	await page.goto('/signup');
	await expect(page.getByRole('heading', { name: 'Make it yours.' })).toBeVisible();
	await expect(page.getByLabel('Email')).toBeVisible();
	await expect(page.locator('.turnstile')).toBeVisible();
	await expect(page.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
		true
	);
});

test('home page offers sign in to guests and keeps the demo open', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
	await expect(page.getByRole('button', { name: 'Curated NYC picks' })).toBeEnabled();
});

test('GET /signout never ends a session, it just goes home', async ({ page }) => {
	await page.goto('/signout');
	await expect(page).toHaveURL(/\/$/);
});
