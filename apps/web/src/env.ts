import { defineEnvVars } from '@sveltejs/kit/env';

const optional = (v: string | undefined) => v || undefined;

export const variables = defineEnvVars({
	GEMINI_API_KEY: {
		schema: (v) => (v || '').trim(),
		description: 'Google AI Studio key (billed tier for Maps grounding)'
	},
	GOOGLE_MAPS_API_KEY: {
		schema: optional,
		description:
			'Google Cloud key with Places API (New) enabled; powers place photos on experience cards (optional)'
	},
	GOOGLE_MAPS_MAP_ID: {
		schema: optional,
		description:
			'Optional Cloud-based map style ID (Google Maps Platform > Map Management); used by /api/map?style=cloud'
	},
	DATABASE_URL: { schema: (v) => v || '', description: 'Postgres with pgvector' },
	NIMBLE_API_KEY: {
		schema: optional,
		description:
			'Nimble SDK API key (Settings > API Keys), sent as Bearer; powers /v2/search and /v2/extract'
	},
	NIMBLE_BASE_URL: {
		schema: (v) => v || 'https://sdk.nimbleway.com',
		description: 'Nimble SDK API base'
	},
	LONGTAIL: {
		schema: (v) => v === 'true',
		description: 'Enable the slow long-tail web-search fallback (off for the demo)'
	},
	DEMO_CACHE: {
		schema: (v) => v !== 'false',
		description: 'Cache the scripted demo prompt response'
	},
	// Accounts (better-auth). Locally these come from `.env`; on Workers, secrets via `wrangler secret put`.
	BETTER_AUTH_SECRET: {
		schema: optional,
		description:
			'Signs session cookies and tokens; generate with `openssl rand -base64 32`. Required for sign-in.'
	},
	BETTER_AUTH_URL: {
		schema: (v) => {
			const url = v?.trim();
			if (!url) return undefined;
			if (!/^https?:\/\//i.test(url))
				throw new Error(`BETTER_AUTH_URL must be an absolute http(s) URL, got "${url}"`);
			return url.replace(/\/$/, '');
		},
		description:
			'Public origin of this app (https://app.explorin.app); used in verification and reset links. ' +
			'Inferred from the request when unset.'
	},
	TURNSTILE_SITE_KEY: {
		public: true,
		schema: (v) => v?.trim() || '',
		description: 'Cloudflare Turnstile site key (public; rendered on the sign-in and sign-up forms)'
	},
	TURNSTILE_SECRET_KEY: {
		schema: optional,
		description:
			'Turnstile secret for siteverify. Sign-up, sign-in and password reset refuse every request without it.'
	},
	TURNSTILE_HOSTNAMES: {
		schema: (v) =>
			(v ?? '')
				.split(',')
				.map((h) => h.trim().toLowerCase())
				.filter(Boolean),
		description:
			'Comma-separated hostnames a Turnstile token may have been solved on. Empty means any (dev only).'
	},
	RESEND_API_KEY: {
		schema: optional,
		description: 'Resend API key for verification and password-reset emails'
	},
	AUTH_FROM_EMAIL: {
		schema: (v) => v?.trim() || 'Explorin <onboarding@resend.dev>',
		description: 'Sender for account emails; must be on a domain verified in Resend'
	}
});
