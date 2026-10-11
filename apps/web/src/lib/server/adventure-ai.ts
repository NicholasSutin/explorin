import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { GEMINI_API_KEY } from '$app/env/private';
export async function adventureAI<T>(prompt: string): Promise<T | null> {
	if (!GEMINI_API_KEY) return null;
	try {
		const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
		const result = await ai.models.generateContent({
			model: 'gemini-3.8-flash',
			contents: prompt,
			config: {
				responseMimeType: 'application/json',
				httpOptions: { timeout: 18000 },
				// Extraction and short composition, not a reasoning task: keep it quick for the demo.
				thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }
			}
		});
		return JSON.parse(result.text || 'null') as T;
	} catch {
		return null;
	}
}
export function safeUrl(value: string): boolean {
	try {
		return ['https:', 'http:'].includes(new URL(value).protocol);
	} catch {
		return false;
	}
}
