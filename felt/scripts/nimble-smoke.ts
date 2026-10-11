/** One real call per Nimble job so we can confirm endpoint paths and response field names before trusting them. */
import { nimbleSdk, nimbleWebApi, nimbleSdkEnabled, nimbleMapsEnabled } from './_shared';

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

if (nimbleSdkEnabled()) {
	await attempt('SDK /v2/search', () =>
		nimbleSdk('/v2/search', {
			query: 'scenic running routes NYC Empire State view',
			max_results: 3,
			search_depth: 'lite'
		})
	);
	await attempt('SDK template google_maps_search', () =>
		nimbleSdk('/v2/extract/templates/run', {
			template: 'google_maps_search',
			params: { query: 'Gantry Plaza State Park New York' }
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

if (nimbleMapsEnabled()) {
	await attempt('WebAPI google_maps_search', () =>
		nimbleWebApi('google_maps_search', { query: 'Gantry Plaza State Park New York' })
	);
	await attempt('WebAPI google_maps_reviews (needs place_id from above)', async () => {
		const s = await nimbleWebApi('google_maps_search', {
			query: 'Gantry Plaza State Park New York'
		});
		const ents = s?.parsing?.entities ?? s?.parsing ?? {};
		const pid = (ents.SearchResult ?? ents.Place ?? [])[0]?.place_id;
		return pid
			? nimbleWebApi('google_maps_reviews', { place_id: pid })
			: { note: 'no place_id found; inspect search output above', entityKeys: Object.keys(ents) };
	});
} else
	console.log(
		'NIMBLE_USERNAME/SECRET not set: skipping legacy Web API (Google Maps reviews) checks'
	);
