/**
 * Cold start: real public reviews -> Gemini picks feeling-sentences -> reflections rows.
 * Sources: Google Maps (via Nimble SERP), Tripadvisor + Yelp pages (via Nimble Web API, parsed by Gemini).
 * Run once: node --env-file=.env --import tsx scripts/ingest-reviews.ts [--only "Place Name"] [--skip-maps]
 */
import {
	sql,
	generateJson,
	embedDoc,
	nimbleSdk,
	nimbleWebApi,
	nimbleSdkEnabled,
	nimbleMapsEnabled,
	htmlToText,
	vec
} from './_shared';
import {
	INGEST_SCHEMA,
	INGEST_SYSTEM,
	EXTRACT_REVIEWS_SCHEMA,
	EXTRACT_REVIEWS_SYSTEM
} from '../src/lib/server/prompts';

type Source = 'public_review' | 'tripadvisor_review' | 'yelp_review';
const DISPLAY: Record<Source, string> = {
	public_review: 'Google Maps reviewer',
	tripadvisor_review: 'Tripadvisor reviewer',
	yelp_review: 'Yelp reviewer'
};

const only = process.argv.includes('--only')
	? process.argv[process.argv.indexOf('--only') + 1]
	: null;
const skipMaps = process.argv.includes('--skip-maps');
if (!nimbleSdkEnabled()) {
	console.error(
		'NIMBLE_API_KEY not set; nothing to ingest. Kill rule: npm run db:seed-reflections'
	);
	process.exit(1);
}
if (!nimbleMapsEnabled() && !skipMaps)
	console.warn(
		'NIMBLE_USERNAME/SECRET not set: skipping Google Maps reviews, using Tripadvisor/Yelp pages only'
	);

const places = await sql<{ id: string; name: string; review_urls: string[] }[]>`
	SELECT id, name, review_urls FROM places ${only ? sql`WHERE name = ${only}` : sql``} ORDER BY name`;

async function mapsReviews(place: string): Promise<string[]> {
	const search = await nimbleWebApi('google_maps_search', { query: `${place} New York` });
	const ents = search?.parsing?.entities ?? search?.parsing ?? {};
	const first = (ents.SearchResult ?? ents.Place ?? [])[0];
	const placeId = first?.place_id ?? first?.placeId;
	if (!placeId) return [];
	const data = await nimbleWebApi('google_maps_reviews', { place_id: placeId, sort: 'relevant' });
	const rents = data?.parsing?.entities ?? data?.parsing ?? {};
	const list: any[] = rents.Review ?? rents.Reviews ?? rents.reviews ?? [];
	return list
		.map((r) => String(r.text ?? r.review ?? r.snippet ?? ''))
		.filter((t) => t.length > 20)
		.slice(0, 20);
}

async function pageReviews(url: string, place: string): Promise<string[]> {
	const data = await nimbleSdk('/v2/extract', {
		url,
		render: 'auto',
		formats: ['markdown'],
		markdown_backend: 'main_content',
		country: 'US',
		locale: 'en'
	});
	const text: string = data?.data?.markdown || htmlToText(data?.data?.html ?? '');
	if (text.length < 500) return [];
	const out = await generateJson<{ reviews: { text: string }[] }>(
		`PLACE: ${place}\nPAGE TEXT:\n${text.slice(0, 60000)}`,
		EXTRACT_REVIEWS_SCHEMA,
		EXTRACT_REVIEWS_SYSTEM
	);
	return out.reviews
		.map((r) => r.text)
		.filter((t) => t.length > 20)
		.slice(0, 20);
}

async function store(placeId: string, source: Source, reviews: string[]) {
	if (!reviews.length) return 0;
	const { excerpts } = await generateJson<{
		excerpts: { quote: string; emotions: string[]; themes: string[] }[];
	}>(
		`REVIEWS:\n${reviews.map((r, i) => `${i + 1}. ${r}`).join('\n')}`,
		INGEST_SCHEMA,
		INGEST_SYSTEM
	);
	let n = 0;
	for (const e of excerpts.filter((x) => x.quote.trim().split(/\s+/).length >= 7).slice(0, 3)) {
		const dup =
			await sql`SELECT 1 FROM reflections WHERE place_id = ${placeId} AND quote = ${e.quote}`;
		if (dup.length) continue;
		const emb = await embedDoc(e.quote);
		await sql`INSERT INTO reflections (place_id, source, display_name, body, quote, emotions, themes, consent_share, embedding)
		          VALUES (${placeId}, ${source}, ${DISPLAY[source]}, ${e.quote}, ${e.quote}, ${e.emotions}, ${e.themes}, true, ${vec(emb)}::vector)`;
		n++;
	}
	return n;
}

let total = 0;
for (const p of places) {
	const jobs: Promise<void>[] = [];
	if (!skipMaps)
		jobs.push(
			mapsReviews(p.name)
				.then((r) => store(p.id, 'public_review', r))
				.then((n) => {
					total += n;
					console.log(`  maps        ${p.name}: +${n}`);
				})
				.catch((e) => console.warn(`  maps        ${p.name}: ${e.message}`))
		);
	for (const url of p.review_urls ?? []) {
		const source: Source = url.includes('tripadvisor')
			? 'tripadvisor_review'
			: url.includes('yelp')
				? 'yelp_review'
				: 'public_review';
		jobs.push(
			pageReviews(url, p.name)
				.then((r) => store(p.id, source, r))
				.then((n) => {
					total += n;
					console.log(`  ${source.padEnd(11)} ${p.name}: +${n}`);
				})
				.catch((e) => console.warn(`  ${source.padEnd(11)} ${p.name}: ${e.message}`))
		);
	}
	await Promise.all(jobs);
}
console.log(`inserted ${total} reflections`);
await sql.end();
