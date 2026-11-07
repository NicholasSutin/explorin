import { defineConfig } from '@playwright/test';
export default defineConfig({
	testDir: './tests',
	timeout: 60000,
	// One dev server, real upstream calls and a shared server log: run files one at a time.
	workers: 1,
	use: {
		baseURL: 'http://127.0.0.1:4173',
		browserName: 'chromium',
		viewport: { width: 390, height: 844 }
	},
	webServer: {
		command: 'npm run dev -- --host 127.0.0.1 --port 4173',
		url: 'http://127.0.0.1:4173',
		reuseExistingServer: !process.env.CI
	}
});
