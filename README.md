# Explorin

Hyper-personalized NYC experiences, recommended with evidence from how similar people felt there.
Built at the AI Engineer NYC Hackathon, October 11, 2026.

## Layout

| Path | What it is |
|---|---|
| [`apps/web/`](apps/web/) | The Explorin web app (SvelteKit, Cloudflare Workers + R2, Postgres/pgvector, Gemini, Nimble). See its [README](apps/web/README.md) and [MVP.md](apps/web/MVP.md). |
| [`apps/marketing/`](apps/marketing/) | The marketing site (not yet scaffolded). Source photos live in `assets/images/`. |
| [`packages/brand/`](packages/brand/) | Shared brand kit: logo, wordmark, icons, OG cards, palette. See its [README](packages/brand/README.md). |
| [`docs/pre-build/`](docs/pre-build/) | Pre-build context: product plan, event info, judging criteria, research. [PLAN.md](docs/pre-build/PLAN.md) is the scope source of truth. |
| `media/brag/` | Launch-video render output (gitignored, local only). |
| `.agents/skills/` | Agent skills used during the build (brag, Svelte best practices). |

## Working in the repo

Each app is an npm workspace. Run the web app with:

```bash
npm install
npm run dev:web
```

Or `cd apps/web` and use its scripts directly as before.
