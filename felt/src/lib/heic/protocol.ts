/** Messages between the main thread and the HEIC decode worker. Kept DOM-free. */

/** Decoding past this many pixels risks exhausting the WASM heap on a phone. */
export const MAX_PIXELS = 50e6;

export interface DecodeRequest {
	id: number;
	bytes: Uint8Array;
}

export type DecodeResponse =
	| { id: number; ok: true; width: number; height: number; buffer: ArrayBuffer }
	| { id: number; ok: false; message: string };
