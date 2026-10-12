# Explorin

Hyper-personalized NYC experiences, recommended with evidence from how similar people felt there.
Built at the AI Engineer NYC Hackathon, October 11, 2026.

## Layout

| Path | What it is |
|---|---|
| [`apps/web/`](apps/web/) | The Explorin web app (SvelteKit, Cloudflare Workers + R2, Postgres/pgvector, Gemini, Nimble). See its [README](apps/web/README.md) and [MVP.md](apps/web/MVP.md). |
| [`apps/marketing/`](apps/marketing/) | The public landing page and waitlist: SvelteKit on Cloudflare Workers with D1, brand synced from `packages/brand`. Source photos live in `assets/images/`. See its [README](apps/marketing/README.md). |
| [`packages/brand/`](packages/brand/) | Shared brand kit: logo, wordmark, icons, OG cards, palette. See its [README](packages/brand/README.md). |
| [`docs/system-design.md`](docs/system-design.md) | How the system fits together: flows, API contracts, data model, caching, failure modes, what to revisit. |
| [`docs/adr/`](docs/adr/) | Architecture decision records: monorepo, one product, people-like-you in discovery, deploy targets, marketing site and waitlist. |
| [`docs/pre-build/`](docs/pre-build/) | Pre-build context: product plan, event info, judging criteria, research. [PLAN.md](docs/pre-build/PLAN.md) is the scope source of truth. |
| `media/brag/` | Launch-video render output (gitignored, local only). |
| `.agents/skills/` | Agent skills used during the build (brag, Svelte best practices). |

## Working in the repo

Each app is an npm workspace. Install once at the root, then:

```bash
npm install
npm run dev:web          # SvelteKit app with HMR
npm run dev:marketing    # marketing site + waitlist on http://localhost:4321 (local D1)
npm run build            # both apps
npm run check:web        # svelte-check
npm run test:web         # Playwright end-to-end
```

Or `cd apps/web` and use its scripts directly.
