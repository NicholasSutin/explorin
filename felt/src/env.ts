import { defineEnvVars } from '@sveltejs/kit/env';

const optional = (v: string | undefined) => v || undefined;

export const variables = defineEnvVars({
	GEMINI_API_KEY: {
		schema: (v) => (v || '').trim(),
		description: 'Google AI Studio key (billed tier for Maps grounding)'
	},
	GOOGLE_MAPS_API_KEY: {
		schema: optional,
		description:
			'Google Cloud key with Places API (New) enabled; powers place photos on experience cards (optional)'
	},
	GOOGLE_MAPS_MAP_ID: {
		schema: optional,
		description:
			'Optional Cloud-based map style ID (Google Maps Platform > Map Management); used by /api/map?style=cloud'
	},
	DATABASE_URL: { schema: (v) => v || '', description: 'Postgres with pgvector' },
	NIMBLE_API_KEY: {
		schema: optional,
		description:
			'Nimble SDK API key (Settings > API Keys), sent as Bearer; powers /v2/search and /v2/extract'
	},
	NIMBLE_BASE_URL: {
		schema: (v) => v || 'https://sdk.nimbleway.com',
		description: 'Nimble SDK API base'
	},
	NIMBLE_USERNAME: {
		schema: optional,
		description: 'Nimble Web API username (Client credentials); needed for Google Maps engines'
	},
	NIMBLE_SECRET: {
		schema: optional,
		description: 'Nimble Web API secret/password (Client credentials)'
	},
	NIMBLE_WEBAPI_URL: {
		schema: (v) => v || 'https://api.webit.live/api/v1',
		description: 'Nimble Web API base'
	},
	LONGTAIL: {
		schema: (v) => v === 'true',
		description: 'Enable the slow long-tail web-search fallback (off for the demo)'
	},
	DEMO_CACHE: {
		schema: (v) => v !== 'false',
		description: 'Cache the scripted demo prompt response'
	}
});
