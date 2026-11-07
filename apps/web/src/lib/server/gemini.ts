import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import {
	AI_GATEWAY,
	GEMINI_API_KEY,
	NEON_AI_GATEWAY_BASE_URL,
	NEON_AI_GATEWAY_TOKEN
} from '$app/env/private';
import { trackEmbedding, trackGemini } from './usage';

export const MODEL = 'gemini-3.8-flash';
export const EMBED_MODEL = 'gemini-embedding-2';
export const EMBED_DIM = 768;

/**
 * Embeddings always go to Google AI Studio: the Neon AI Gateway has no Gemini embedding model, and every stored
 * vector (reflections, taste) is gemini-embedding-2 at 768 dimensions, which another model's vectors can't be
 * compared with.
 */
const google = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

/**
 * Generation goes to Google too, unless AI_GATEWAY=neon: then to this Neon branch's AI Gateway, whose native Gemini
 * route takes the same SDK with another base URL (ADR-0010). The gateway authenticates a Bearer header and ignores
 * the SDK's x-goog-api-key, which only has to be non-empty. Its catalog spells model ids with dashes.
 */
const gateway =
	AI_GATEWAY === 'neon' && NEON_AI_GATEWAY_BASE_URL && NEON_AI_GATEWAY_TOKEN
		? new GoogleGenAI({
				apiKey: 'neon-ai-gateway',
				httpOptions: {
					baseUrl: `${NEON_AI_GATEWAY_BASE_URL}/gemini`,
					headers: { Authorization: `Bearer ${NEON_AI_GATEWAY_TOKEN}` }
				}
			})
		: null;
if (AI_GATEWAY === 'neon' && !gateway)
	console.warn(
		'[gemini] AI_GATEWAY=neon without NEON_AI_GATEWAY_BASE_URL/TOKEN; using Google directly'
	);

const ai = gateway ?? google;
const model = gateway ? MODEL.replaceAll('.', '-') : MODEL;
/** Whether generation has a credential at all (the gateway's or Google's). */
const canGenerate = Boolean(gateway || GEMINI_API_KEY);

export type Part = { text: string } | { inlineData: { mimeType: string; data: string } };

export async function generateJson<T>(
	contents: Part[] | string,
	schema: object,
	system?: string,
	operation = 'generate'
): Promise<T> {
	const res = await ai.models.generateContent({
		model,
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
	trackGemini(operation, res.usageMetadata);
	const text = res.text;
	if (!text) throw new Error('Gemini returned no text');
	return JSON.parse(text) as T;
}

export async function embed(
	text: string,
	kind: 'query' | 'doc',
	operation = 'embed'
): Promise<number[]> {
	const prefixed =
		kind === 'query' ? `task: search result | query: ${text}` : `title: none | text: ${text}`;
	const out = await google.models.embedContent({
		model: EMBED_MODEL,
		contents: prefixed,
		config: { outputDimensionality: EMBED_DIM }
	});
	trackEmbedding(operation, prefixed);
	const values = out.embeddings?.[0]?.values;
	if (!values) throw new Error('No embedding returned');
	return values;
}

/**
 * Loose JSON generation for the planner and the keepsake draft: no response schema, short
 * timeout, and null instead of throwing so every caller can degrade honestly.
 */
export async function adventureAI<T>(prompt: string, operation = 'generate'): Promise<T | null> {
	if (!canGenerate) return null;
	try {
		const result = await ai.models.generateContent({
			model,
			contents: prompt,
			config: {
				responseMimeType: 'application/json',
				httpOptions: { timeout: 18000 },
				thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }
			}
		});
		trackGemini(operation, result.usageMetadata);
		return JSON.parse(result.text || 'null') as T;
	} catch (e) {
		// Callers degrade on null; the log says why (a gateway 403 "paid_plan_required" means no credits yet).
		console.warn(`[gemini] ${operation} failed:`, (e as Error)?.message?.slice(0, 300) ?? e);
		return null;
	}
}
