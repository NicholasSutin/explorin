/** Verifies the two Gemini capabilities the app relies on: structured JSON and 768-d embeddings. */
import { ai, MODEL } from './_shared';

const t0 = Date.now();
const lap = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;

try {
	const r = await ai().models.generateContent({
		model: MODEL,
		contents: 'Return a JSON object describing a sunrise run at Gantry Plaza.',
		config: {
			responseMimeType: 'application/json',
			responseSchema: {
				type: 'OBJECT',
				properties: { title: { type: 'STRING' }, vibe: { type: 'STRING' } },
				required: ['title', 'vibe']
			}
		}
	});
	console.log(`[${lap()}] JSON ok:`, r.text?.slice(0, 160));
} catch (e: any) {
	console.error(`[${lap()}] JSON FAILED:`, e.message?.slice(0, 400));
}

try {
	const e = await ai().models.embedContent({
		model: 'gemini-embedding-2',
		contents: 'title: none | text: hello',
		config: { outputDimensionality: 768 }
	});
	console.log(`[${lap()}] embed ok: dims =`, e.embeddings?.[0]?.values?.length);
} catch (e: any) {
	console.error(`[${lap()}] embed FAILED:`, e.message?.slice(0, 400));
}
