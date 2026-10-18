/**
 * better-auth instance. Sign-up is email first: the form takes an address and a Turnstile token, the
 * magic-link plugin emails a one-hour link, opening it creates the (verified) account, starts the session
 * and lands on /signup/password where the password is chosen (`setPassword`). Sign-in is then email +
 * password. Turnstile guards the link request, sign-in and password reset; sessions live in Postgres
 * through the app's existing postgres.js connection (Kysely dialect). Mounted at /api/auth by hooks.server.ts.
 * https://www.better-auth.com/docs
 */
import { betterAuth } from 'better-auth';
import { captcha, magicLink } from 'better-auth/plugins';
import { PostgresJSDialect } from 'kysely-postgres-js';
import { building, dev } from '$app/env';
import { getRequestEvent } from '$app/server';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import {
	BETTER_AUTH_SECRET,
	BETTER_AUTH_URL,
	TURNSTILE_HOSTNAMES,
	TURNSTILE_SECRET_KEY
} from '$app/env/private';
import { ensureUser, sql } from './db';
import { sendPasswordResetEmail, sendSignupLinkEmail, sendVerificationEmail } from './email';

/** Turnstile `action` every auth form renders its widget with; the server rejects tokens for any other. */
export const TURNSTILE_ACTION = 'auth';

export const authConfigured = () => Boolean(BETTER_AUTH_SECRET);

if (!building && !BETTER_AUTH_SECRET)
	console.warn('[auth] BETTER_AUTH_SECRET unset: sign-in is disabled until it is configured');
if (!building && !dev && !TURNSTILE_SECRET_KEY)
	console.error(
		'[auth] TURNSTILE_SECRET_KEY unset in production: every sign-up and sign-in will be refused'
	);

/** Paths that must carry a Turnstile token (`x-captcha-response`); relative to /api/auth. */
const CAPTCHA_ENDPOINTS = ['/sign-in/magic-link', '/sign-in/email', '/request-password-reset'];

/** Where the emailed sign-up link lands: the page that asks for a password (it forwards accounts that have one). */
export const SIGNUP_PASSWORD_PATH = '/signup/password';

/**
 * Cloudflare's dummy secrets (1x…, 2x…, 3x… "always passes / always fails / token spent") answer siteverify
 * without an `action` and with hostname "example.com", so the strict checks would reject them. They are
 * honoured in `vite dev` only; production always checks the action and the hostname allow-list.
 * https://developers.cloudflare.com/turnstile/troubleshooting/testing/
 */
const usingTestSecret = dev && /^[123]x0+AA$/.test(TURNSTILE_SECRET_KEY ?? '');

export const auth = betterAuth({
	appName: 'Explorin',
	// Without BETTER_AUTH_SECRET the instance still constructs (the build analyses routes, and the demo must keep
	// working), but hooks.server.ts refuses every /api/auth request and never reads a session: see `authConfigured`.
	secret: BETTER_AUTH_SECRET ?? 'unconfigured-placeholder-see-authConfigured-00000000',
	baseURL: BETTER_AUTH_URL,
	trustedOrigins: dev ? ['http://localhost:5173', 'http://127.0.0.1:4173'] : [],
	database: {
		// `sql` resolves to the current request's connection on Workers (see db.ts).
		dialect: new PostgresJSDialect({ postgres: sql }),
		type: 'postgres'
	},
	advanced: {
		database: {
			// uuid ids so better-auth's `user.id` can be the same value as the app's `users.id uuid`.
			generateId: 'uuid',
			// The startup schema check opens a connection outside any request, which Workers forbid; a failed
			// check also makes every auth request fail. The schema is ours (scripts/schema.sql), so check in dev only.
			validateSchema: dev
		},
		cookiePrefix: 'explorin',
		useSecureCookies: !dev
	},
	emailAndPassword: {
		enabled: true,
		// Accounts are only created by opening the emailed link (magic-link plugin), never by POST /sign-up/email.
		disableSignUp: true,
		minPasswordLength: 8,
		requireEmailVerification: true,
		revokeSessionsOnPasswordReset: true,
		sendResetPassword: async ({ user, url }) => {
			await sendPasswordResetEmail(user.email, user.name, url);
		}
	},
	// Link-created accounts are verified from the start; this only covers accounts from before the link flow.
	emailVerification: {
		sendOnSignIn: true,
		autoSignInAfterVerification: true,
		expiresIn: 60 * 60,
		sendVerificationEmail: async ({ user, url }) => {
			await sendVerificationEmail(user.email, user.name, url);
		}
	},
	user: {
		additionalFields: {
			// Set by the onboarding form, never by the client directly.
			homeCity: { type: 'string', required: false, input: false },
			onboardedAt: { type: 'date', required: false, input: false }
		}
	},
	// Rate limiting is Cloudflare's RATE_LIMITER_* bindings, applied in hooks.server.ts before the request reaches
	// better-auth (src/lib/server/rate-limit.ts). better-auth's own limiter is in-memory, per isolate on Workers, and
	// resets on every cold start, so it stays off.
	rateLimit: { enabled: false },
	session: {
		expiresIn: 60 * 60 * 24 * 30,
		updateAge: 60 * 60 * 24
	},
	databaseHooks: {
		user: {
			create: {
				// Mirror into the app's `users` table so profiles, experiences and reflections can reference the account.
				after: async (user) => {
					await ensureUser(user.id, user.name || null); // the name is chosen at onboarding
				}
			}
		}
	},
	plugins: [
		magicLink({
			expiresIn: 60 * 60,
			storeToken: 'hashed',
			sendMagicLink: async ({ email, url }) => {
				await sendSignupLinkEmail(email, url);
			}
		}),
		captcha({
			provider: 'cloudflare-turnstile',
			secretKey: TURNSTILE_SECRET_KEY ?? '',
			endpoints: CAPTCHA_ENDPOINTS,
			expectedAction: usingTestSecret ? undefined : TURNSTILE_ACTION,
			// No allow-list configured (dev) means any hostname passes.
			allowedHostnames:
				TURNSTILE_HOSTNAMES.length && !usingTestSecret ? TURNSTILE_HOSTNAMES : undefined
		}),
		// Lets server-side `auth.api.*` calls (sign-out action) set cookies through SvelteKit. Must stay last.
		sveltekitCookies(getRequestEvent)
	]
});

export type Session = typeof auth.$Infer.Session;
export type AuthUser = Session['user'];

/** Session for this request, or null when there is none, it expired, or the database is unreachable. */
export async function getSession(headers: Headers): Promise<Session | null> {
	try {
		return await auth.api.getSession({ headers });
	} catch (e) {
		console.warn('[auth] getSession failed', (e as Error).message);
		return null;
	}
}

/** True when the account can sign in with a password (the sign-up link flow was completed). */
export async function hasPassword(userId: string): Promise<boolean> {
	const ctx = await auth.$context;
	const account = await ctx.internalAdapter.findCredentialAccount(userId);
	return Boolean(account?.password);
}

/**
 * Set the first password on the signed-in account (the step after the emailed sign-up link). Server-only
 * endpoint: better-auth refuses it once a password exists, so it can never overwrite one.
 */
export async function setPassword(headers: Headers, newPassword: string) {
	await auth.api.setPassword({ headers, body: { newPassword } });
}

/** Step 1 of onboarding: what to call them and where they explore (server-only fields). */
export async function saveAccountBasics(userId: string, data: { name: string; homeCity: string }) {
	const ctx = await auth.$context;
	await ctx.internalAdapter.updateUser(userId, { name: data.name, homeCity: data.homeCity });
	await ensureUser(userId, data.name);
}

/** The tier list is done: the account can plan. Until then every page sends it back to onboarding. */
export async function markOnboarded(userId: string) {
	const ctx = await auth.$context;
	await ctx.internalAdapter.updateUser(userId, { onboardedAt: new Date() });
}
