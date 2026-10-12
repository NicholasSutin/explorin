// Helpers for standalone scripts (run with: node --env-file=.env --import tsx scripts/<name>.ts).
// Scripts cannot import $app/env, so they read process.env directly.
import postgres from 'postgres';
import { GoogleGenAI } from '@google/genai';

export const env = (k: string, required = true) => {
	const v = process.env[k];
	if (!v && required) throw new Error(`${k} not set (put it in .env)`);
	return v ?? '';
};

// Lazy so scripts that only need Nimble (e.g. nimble-smoke) run without DATABASE_URL / GEMINI_API_KEY.
let _sql: ReturnType<typeof postgres> | undefined;
let _ai: GoogleGenAI | undefined;
const db = () =>
	(_sql ??= postgres(env('DATABASE_URL'), { max: 3, prepare: false, onnotice: () => {} }));
export const sql: ReturnType<typeof postgres> = new Proxy(
	(() => {}) as unknown as ReturnType<typeof postgres>,
	{
		get: (_t, k) => Reflect.get(db(), k),
		apply: (_t, _this, args) => Reflect.apply(db(), _this, args)
	}
);
export const ai = (): GoogleGenAI => (_ai ??= new GoogleGenAI({ apiKey: env('GEMINI_API_KEY') }));
export const MODEL = 'gemini-3.8-flash';
export const vec = (v: number[]) => `[${v.join(',')}]`;

export async function generateJson<T>(
	contents: string,
	schema: object,
	system?: string
): Promise<T> {
	const res = await ai().models.generateContent({
		model: MODEL,
		contents,
		config: {
			responseMimeType: 'application/json',
			responseSchema: schema,
			systemInstruction: system,
			temperature: 0.3
		}
	});
	return JSON.parse(res.text!) as T;
}

export async function embedDoc(text: string): Promise<number[]> {
	const out = await ai().models.embedContent({
		model: 'gemini-embedding-2',
		contents: `title: none | text: ${text}`,
		config: { outputDimensionality: 768 }
	});
	return out.embeddings![0].values!;
}

const SDK_BASE = process.env.NIMBLE_BASE_URL || 'https://sdk.nimbleway.com';
export const nimbleEnabled = () => Boolean(process.env.NIMBLE_API_KEY);

async function post(url: string, auth: string, body: Record<string, unknown>): Promise<any> {
	const res = await fetch(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: auth },
		body: JSON.stringify(body)
	});
	if (!res.ok)
		throw new Error(
			`Nimble ${new URL(url).pathname} ${res.status}: ${(await res.text()).slice(0, 400)}`
		);
	return res.json();
}
/** SDK API (Bearer API key): /v2/search, /v2/extract, /v2/extract/templates/run */
export const nimbleSdk = (path: string, body: Record<string, unknown>) =>
	post(`${SDK_BASE}${path}`, `Bearer ${env('NIMBLE_API_KEY').replace(/^Bearer\s+/i, '')}`, body);
export const htmlToText = (html: string) =>
	html
		.replace(/<script[\s\S]*?<\/script>/gi, ' ')
		.replace(/<style[\s\S]*?<\/style>/gi, ' ')
		.replace(/<[^>]+>/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 60000);
