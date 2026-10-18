/**
 * One real call per Nimble job (planner web search; review-page extract for ingest-reviews.ts) to confirm endpoint
 * paths and response field names before trusting them.
 */
import { nimbleSdk, nimbleEnabled } from './_shared';

const show = (label: string, data: any) => {
	console.log(`\n=== ${label}`);
	console.log(JSON.stringify(data, null, 2).slice(0, 2500));
};
const attempt = async (label: string, fn: () => Promise<any>) => {
	try {
		show(label, await fn());
	} catch (e: any) {
		console.error(`${label} FAILED:`, e.message);
	}
};

if (nimbleEnabled()) {
	await attempt('SDK /v2/search', () =>
		nimbleSdk('/v2/search', {
			query: 'scenic running routes NYC Empire State view',
			max_results: 3,
			search_depth: 'lite'
		})
	);
	await attempt('SDK /v2/extract (yelp, markdown)', async () => {
		const d = await nimbleSdk('/v2/extract', {
			url: 'https://www.yelp.com/biz/little-island-new-york',
			render: 'auto',
			formats: ['markdown'],
			markdown_backend: 'main_content'
		});
		return {
			status: d.status,
			keys: Object.keys(d.data ?? {}),
			markdown_head: String(d.data?.markdown ?? '').slice(0, 800)
		};
	});
} else console.log('NIMBLE_API_KEY not set: skipping SDK checks');
