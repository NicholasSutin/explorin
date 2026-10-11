import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// Default: plain SvelteKit dev server (HMR) + adapter-node build, photos on local disk.
// `DEPLOY_TARGET=cloudflare npm run build` (or `npm run deploy`) switches to Workers + R2.
const cloudflare = process.env.DEPLOY_TARGET === 'cloudflare';
const adapter = cloudflare
	? (await import('@sveltejs/adapter-cloudflare')).default()
	: (await import('@sveltejs/adapter-node')).default();

const storage = fileURLToPath(
	new URL(
		cloudflare ? './src/lib/server/storage.r2.ts' : './src/lib/server/storage.local.ts',
		import.meta.url
	)
);

export default defineConfig({
	resolve: { alias: { '#storage': storage } },
	// Listen on all interfaces so the dev server is reachable on the LAN.
	// `.devtunnels.ms` allows VS Code port-forwarding tunnels (Vite blocks unknown Host headers).
	server: { host: true, allowedHosts: ['.devtunnels.ms'] },
	preview: { host: true },
	// The HEIC decode worker lazy-imports a 1.4 MB libheif bundle; only ES-format workers can code-split.
	worker: { format: 'es' },
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter
		})
	]
});
