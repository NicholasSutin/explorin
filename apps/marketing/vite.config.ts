import { sveltekit } from '@sveltejs/kit/vite';
import adapter from '@sveltejs/adapter-cloudflare';
import { defineConfig } from 'vite';

export default defineConfig({
	server: { host: true },
	plugins: [sveltekit({ adapter: adapter() })]
});
