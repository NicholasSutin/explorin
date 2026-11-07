import { defineConfig } from '@neon/config/v1';

/**
 * Neon project "explorin" (late-surf-27115355), linked in the gitignored `.neon` file. See ADR-0010.
 *
 * Postgres is what the app uses. The AI Gateway and Realtime are declared but are not the app's model route or sync
 * layer yet: Gemini calls go through the gateway only with AI_GATEWAY=neon, and no page reads a live query.
 *
 * Identity is the app's own better-auth (src/lib/server/auth.ts: Turnstile captcha, Resend mail, Cloudflare rate
 * limits, its tables in `public`). Neon's Managed Auth is NOT used and is deliberately `false` here, so env pulls
 * never write NEON_AUTH_* and nothing points at it. The console had already enabled it on these branches; its
 * `neon_auth` schema is empty and separate from `public."user"`. Moving to it would mean re-importing every account
 * and losing the captcha, mailer and rate-limit setup, so it needs its own decision (ADR-0010).
 *
 *   neon config plan          # what `neon deploy` would change on the pinned branch
 *   neon deploy               # apply it
 */
export default defineConfig({
	preview: {
		realtime: true
	},
	auth: false,
	aiGateway: true,
	branch: (branch) => {
		// production: the live database. Worth `protected: true` (no delete or reset, children get their own role
		// passwords) once the plan allows it; the Free plan has no protected branches.
		if (branch.isDefault) return {};
		// dev: the long-lived branch local development points at (`neon checkout dev`). Refresh it from production
		// with `neon branches reset dev --parent`.
		if (branch.name === 'dev') return {};
		// Anything else is a throwaway (rehearsals, e2e runs, previews): created with a TTL so it cleans itself up.
		if (!branch.exists) return { ttl: '7d' };
		return {};
	}
});
