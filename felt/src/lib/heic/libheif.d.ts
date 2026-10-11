/**
 * Types for the pre-bundled libheif WASM build. The package ships a `libheif.d.ts` beside it, but
 * that only describes the raw Emscripten exports and TypeScript will not associate it with the
 * `.mjs` path, so the small surface actually used here is declared instead.
 */
declare module 'libheif-js/libheif-wasm/libheif-bundle.mjs' {
	/** One image in a HEIF container. A file may hold several; the first is the photo. */
	export interface HeifImage {
		get_width(): number;
		get_height(): number;
		/**
		 * Fills `target.data` with RGBA in the file's own colour space, applying any `irot`/`imir`
		 * transform. Calls back with `null` on failure.
		 */
		display(target: ImageData, done: (result: ImageData | null) => void): void;
		/** Releases the WASM-heap allocation backing this image. */
		free(): void;
	}

	export interface HeifDecoder {
		/** Returns `[]` (and logs to the console) when the bytes are not a parseable HEIF file. */
		decode(data: Uint8Array): HeifImage[];
	}

	export interface LibHeif {
		HeifDecoder: new () => HeifDecoder;
	}

	/**
	 * Emscripten module factory. The WASM is embedded in the bundle, so this compiles synchronously
	 * and returns the module directly rather than a promise, which also means it must only ever be
	 * called off the main thread, where synchronous compilation of a >4 KB module is allowed.
	 */
	export default function libheif(options?: Record<string, unknown>): LibHeif;
}
