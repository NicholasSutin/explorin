import { defineEnvVars } from '@sveltejs/kit/env';

const optional = (v: string | undefined) => v?.trim() || undefined;

/**
 * Locally these come from `.env` (see `.env.example`). On Workers, secrets come from
 * `npx wrangler secret put <NAME>` and the public site key can be a plain var.
 */
export const variables = defineEnvVars({
	TURNSTILE_SITE_KEY: {
		public: true,
		schema: (v) => v?.trim() || '',
		description: 'Cloudflare Turnstile site key (public; rendered into the page)'
	},
	TURNSTILE_SECRET_KEY: {
		schema: optional,
		description:
			'Turnstile secret key for siteverify. The waitlist refuses every submission without it.'
	},
	TURNSTILE_HOSTNAMES: {
		schema: (v) =>
			(v ?? '')
				.split(',')
				.map((h) => h.trim().toLowerCase())
				.filter(Boolean),
		description:
			'Comma-separated hostnames a token may have been solved on. Production must not include localhost.'
	},
	RESEND_API_KEY: {
		schema: optional,
		description: 'Resend API key for the welcome email (optional; joining still works without it)'
	},
	WAITLIST_FROM_EMAIL: {
		schema: (v) => v?.trim() || 'Explorin <onboarding@resend.dev>',
		description: 'Sender for the welcome email; must be on a domain verified in Resend'
	},
	APP_URL: {
		schema: (v) => {
			const url = v?.trim();
			if (!url) return undefined;
			if (!/^https?:\/\//i.test(url))
				throw new Error(`APP_URL must be an absolute http(s) URL, got "${url}"`);
			return url;
		},
		description:
			'Where "Open the app" and the welcome email\'s sign-up link point. Leave unset until the app has its own ' +
			'public hostname: with no value the button is not rendered and the email omits the link. It must not ' +
			"be this site's own origin (explorin.app hosts the landing page, not the app)."
	}
});
