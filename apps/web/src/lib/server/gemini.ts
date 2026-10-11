import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { GEMINI_API_KEY } from '$app/env/private';
import { getPhoto } from '#storage';

export const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
export const MODEL = 'gemini-3.8-flash';
export const EMBED_MODEL = 'gemini-embedding-2';
export const EMBED_DIM = 768;

export type Part = { text: string } | { inlineData: { mimeType: string; data: string } };

export async function generateJson<T>(
	contents: Part[] | string,
	schema: object,
	system?: string
): Promise<T> {
	const res = await ai.models.generateContent({
		model: MODEL,
		contents: typeof contents === 'string' ? contents : [{ role: 'user', parts: contents }],
		config: {
			responseMimeType: 'application/json',
			responseSchema: schema,
			systemInstruction: system,
			temperature: 0.4,
			// Fast path: these are extraction/composition jobs, not reasoning puzzles.
			thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }
		}
	});
	const text = res.text;
	if (!text) throw new Error('Gemini returned no text');
	return JSON.parse(text) as T;
}

export async function embed(text: string, kind: 'query' | 'doc'): Promise<number[]> {
	const prefixed =
		kind === 'query' ? `task: search result | query: ${text}` : `title: none | text: ${text}`;
	const out = await ai.models.embedContent({
		model: EMBED_MODEL,
		contents: prefixed,
		config: { outputDimensionality: EMBED_DIM }
	});
	const values = out.embeddings?.[0]?.values;
	if (!values) throw new Error('No embedding returned');
	return values;
}

/** Load an image (R2 key `/photos/...`, data URL, or http URL) as an inlineData part. */
export async function imagePart(url: string): Promise<Part> {
	if (url.startsWith('data:')) {
		const m = url.match(/^data:([^;]+);base64,(.*)$/);
		if (!m) throw new Error('Bad data URL');
		return { inlineData: { mimeType: m[1], data: m[2] } };
	}
	if (url.startsWith('/photos/')) {
		const photo = await getPhoto(url.slice('/photos/'.length));
		if (!photo) throw new Error('Photo not found in storage');
		return {
			inlineData: { mimeType: photo.contentType, data: Buffer.from(photo.body).toString('base64') }
		};
	}
	const res = await fetch(url);
	if (!res.ok) throw new Error(`Image fetch failed: ${res.status}`);
	const mimeType = res.headers.get('content-type')?.split(';')[0] || 'image/jpeg';
	const data = Buffer.from(await res.arrayBuffer()).toString('base64');
	return { inlineData: { mimeType, data } };
}

/**
 * Loose JSON generation for the discovery and scrapbook flows: no response schema, short
 * timeout, and null instead of throwing so every caller can degrade honestly.
 */
export async function adventureAI<T>(prompt: string): Promise<T | null> {
	if (!GEMINI_API_KEY) return null;
	try {
		const result = await ai.models.generateContent({
			model: MODEL,
			contents: prompt,
			config: {
				responseMimeType: 'application/json',
				httpOptions: { timeout: 18000 },
				thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }
			}
		});
		return JSON.parse(result.text || 'null') as T;
	} catch {
		return null;
	}
}

export interface GroundedPlace {
	placeId: string;
	title: string;
	uri: string;
	text?: string;
}

/** Job 3: Maps-grounded candidates. Text only, no responseSchema (cannot be combined). */
export async function groundedPlaces(
	prompt: string,
	lat: number,
	lng: number
): Promise<GroundedPlace[]> {
	const res = await ai.models.generateContent({
		model: MODEL,
		contents: prompt,
		config: {
			tools: [{ googleMaps: {} }],
			toolConfig: { retrievalConfig: { latLng: { latitude: lat, longitude: lng } } }
		}
	});
	const chunks = res.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
	const seen = new Set<string>();
	const out: GroundedPlace[] = [];
	for (const c of chunks) {
		const m = c.maps;
		if (!m?.placeId || !m.title) continue;
		const placeId = m.placeId.replace(/^places\//, '');
		if (seen.has(placeId)) continue;
		seen.add(placeId);
		out.push({
			placeId,
			title: m.title.replace(/\s*-\s*Google Maps$/i, '').trim(),
			uri: m.uri ?? `https://www.google.com/maps/place/?q=place_id:${placeId}`,
			text: m.text
		});
	}
	return out;
}
