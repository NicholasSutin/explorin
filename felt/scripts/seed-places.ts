import { sql } from './_shared';

// Tags must be honest. review_urls: Tripadvisor pages scraped by ingest-reviews.ts via Nimble Extract.
// Yelp pages returned empty markdown through Nimble on 2026-10-11 (bot-blocked), so none are listed.
const places = [
	{
		name: 'Gantry Plaza State Park',
		kind: 'run_route',
		lat: 40.7467,
		lng: -73.958,
		tags: ['water_view', 'esb_view', 'skyline', 'sunrise'],
		notes: 'East River, Long Island City; direct Midtown and Empire State view',
		review_urls: [
			'https://www.tripadvisor.com/Attraction_Review-g60763-d1986201-Reviews-Gantry_Plaza_State_Park-New_York_City_New_York.html'
		]
	},
	{
		name: 'Hunters Point South Park',
		kind: 'run_route',
		lat: 40.7415,
		lng: -73.9598,
		tags: ['water_view', 'esb_view', 'skyline'],
		notes: 'East River; Empire State and Chrysler views',
		review_urls: []
	},
	{
		name: 'Central Park Reservoir',
		kind: 'run_route',
		lat: 40.7855,
		lng: -73.9625,
		tags: ['water_view', 'skyline', 'quiet'],
		notes: '1.58 mile loop, run counterclockwise; reservoir, not river',
		review_urls: [
			'https://www.tripadvisor.com/Attraction_Review-g60763-d104365-Reviews-Jacqueline_Kennedy_Onassis_Reservoir-New_York_City_New_York.html'
		]
	},
	{
		name: 'Brooklyn Bridge Park',
		kind: 'run_route',
		lat: 40.7003,
		lng: -73.9967,
		tags: ['water_view', 'skyline', 'harbor'],
		notes: 'Pier 1 to Pier 6; Lower Manhattan skyline, not Empire State',
		review_urls: [
			'https://www.tripadvisor.com/Attraction_Review-g60827-d2294597-Reviews-Brooklyn_Bridge_Park-Brooklyn_New_York.html'
		]
	},
	{
		name: 'Washington Street, DUMBO',
		kind: 'viewpoint',
		lat: 40.7033,
		lng: -73.9894,
		tags: ['esb_view', 'bridge'],
		notes: 'Empire State framed in the Manhattan Bridge arch',
		review_urls: [
			'https://www.tripadvisor.com/Attraction_Review-g60827-d6744432-Reviews-Dumbo-Brooklyn_New_York.html'
		]
	},
	{
		name: 'Domino Park',
		kind: 'walk',
		lat: 40.7142,
		lng: -73.9679,
		tags: ['water_view', 'skyline'],
		notes: 'East River, Williamsburg',
		review_urls: []
	},
	{
		name: 'Roosevelt Island',
		kind: 'run_route',
		lat: 40.762,
		lng: -73.9497,
		tags: ['water_view', 'skyline', 'quiet'],
		notes: 'Loop; East River on both sides',
		review_urls: [
			'https://www.tripadvisor.com/Attraction_Review-g60763-d104359-Reviews-Roosevelt_Island-New_York_City_New_York.html'
		]
	},
	{
		name: 'Hudson River Greenway',
		kind: 'run_route',
		lat: 40.742,
		lng: -74.01,
		tags: ['water_view', 'sunset'],
		notes: 'Chelsea to Battery; Hudson, city is behind you',
		review_urls: [
			'https://www.tripadvisor.com/Attraction_Review-g60763-d1800258-Reviews-Hudson_River_Park-New_York_City_New_York.html'
		]
	},
	{
		name: 'Fort Tilden',
		kind: 'viewpoint',
		lat: 40.56,
		lng: -73.885,
		tags: ['atlantic', 'skyline', 'quiet'],
		notes:
			'Battery Harris East; ocean plus distant skyline; closest match for "Atlantic and skyline"',
		review_urls: [
			'https://www.tripadvisor.com/Attraction_Review-g47976-d2177304-Reviews-Fort_Tilden-Queens_New_York.html'
		]
	},
	{
		name: 'Coney Island Boardwalk',
		kind: 'run_route',
		lat: 40.5731,
		lng: -73.9797,
		tags: ['atlantic', 'lively'],
		notes: 'True ocean; no skyline at ground level',
		review_urls: [
			'https://www.tripadvisor.com/Attraction_Review-g60827-d268129-Reviews-Coney_Island_Boardwalk-Brooklyn_New_York.html'
		]
	},
	{
		name: 'Rockaway Beach Boardwalk',
		kind: 'run_route',
		lat: 40.583,
		lng: -73.816,
		tags: ['atlantic'],
		notes: 'Ocean only',
		review_urls: [
			'https://www.tripadvisor.com/Attraction_Review-g47976-d126290-Reviews-Rockaway_Beach-Queens_New_York.html'
		]
	},
	{
		name: 'The High Line',
		kind: 'walk',
		lat: 40.748,
		lng: -74.0048,
		tags: ['skyline', 'lively'],
		notes: 'Elevated; peeks of Empire State',
		review_urls: [
			'https://www.tripadvisor.com/Attraction_Review-g60763-d1385465-Reviews-The_High_Line-New_York_City_New_York.html'
		]
	},
	{
		name: 'Little Island',
		kind: 'viewpoint',
		lat: 40.742,
		lng: -74.0105,
		tags: ['water_view', 'sunset'],
		notes: 'Hudson',
		review_urls: [
			'https://www.tripadvisor.com/Attraction_Review-g60763-d23462185-Reviews-Little_Island-New_York_City_New_York.html'
		]
	},
	{
		name: 'East River Esplanade',
		kind: 'run_route',
		lat: 40.774,
		lng: -73.943,
		tags: ['water_view'],
		notes: 'Manhattan side, Queens-facing',
		review_urls: []
	}
];

for (const p of places) {
	await sql`INSERT INTO places (name, kind, lat, lng, tags, notes, review_urls, maps_url)
	          VALUES (${p.name}, ${p.kind}, ${p.lat}, ${p.lng}, ${p.tags}, ${p.notes}, ${p.review_urls},
	                  ${`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name + ' New York')}`})
	          ON CONFLICT (name) DO UPDATE SET kind = EXCLUDED.kind, lat = EXCLUDED.lat, lng = EXCLUDED.lng,
	            tags = EXCLUDED.tags, notes = EXCLUDED.notes, review_urls = EXCLUDED.review_urls`;
}
console.log(`seeded ${places.length} places`);
await sql.end();
