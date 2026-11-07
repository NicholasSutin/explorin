import { defineEnvVars } from '@sveltejs/kit/env';

const optional = (v: string | undefined) => v || undefined;

export const variables = defineEnvVars({
	GEMINI_API_KEY: {
		schema: (v) => (v || '').trim(),
		description:
			'Google AI Studio key: planner picks, tier-list narrowing, keepsake drafts and embeddings'
	},
	GOOGLE_MAPS_API_KEY: {
		schema: optional,
		description:
			'Server-side Google Cloud key: Places API (New), Maps Static API and Geocoding API. Verifies planned stops ' +
			'and supplies their photos (optional)'
	},
	GOOGLE_MAPS_BROWSER_KEY: {
		public: true,
		schema: (v) => v?.trim() || '',
		description:
			'Browser key for the Maps JavaScript API (the interactive trip map). Public by nature: restrict it to ' +
			'HTTP referrers app.explorin.app/* and localhost, and to the Maps JavaScript API only. Without it the trip ' +
			'page falls back to a static map.'
	},
	MONTHLY_CREDITS: {
		schema: (v) => {
			const n = Number(v);
			return Number.isFinite(n) && n > 0 ? Math.round(n) : 2000;
		},
		description:
			'Per-person monthly allowance in credits (1 credit = $0.001 of estimated upstream cost). New plans stop ' +
			'once it is spent; the month resets on the 1st. Default 2000 ($2).'
	},
	DATABASE_URL: {
		schema: (v) => v || '',
		description:
			'Postgres with pgvector: the Neon branch for this environment, pooled host (`-pooler`). Written by ' +
			'`neon env pull`. On Workers the HYPERDRIVE binding is used instead and this is only the fallback.'
	},
	AI_GATEWAY: {
		schema: (v) => (v?.trim().toLowerCase() === 'neon' ? ('neon' as const) : undefined),
		description:
			'"neon" sends Gemini generation (not embeddings) through the Neon AI Gateway of this branch instead of ' +
			'Google AI Studio. Needs NEON_AI_GATEWAY_BASE_URL, NEON_AI_GATEWAY_TOKEN and prepaid gateway credits. ' +
			'Unset means GEMINI_API_KEY direct.'
	},
	NEON_AI_GATEWAY_BASE_URL: {
		schema: (v) => v?.trim().replace(/\/$/, '') || undefined,
		description: "The branch's AI Gateway host, no path (`neon env pull` writes it)"
	},
	NEON_AI_GATEWAY_TOKEN: {
		schema: optional,
		description:
			'Bearer credential for the AI Gateway (`neon env pull` writes it; a secret on Workers)'
	},
	NIMBLE_API_KEY: {
		schema: optional,
		description:
			"Nimble SDK API key (Settings > API Keys), sent as Bearer; powers the planner's web search (/v2/search)"
	},
	NIMBLE_BASE_URL: {
		schema: (v) => v || 'https://sdk.nimbleway.com',
		description: 'Nimble SDK API base'
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
