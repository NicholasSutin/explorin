<script lang="ts">
	import { stripAndResize } from '#lib/client';
	import { isAcceptedPhoto, isHeicFile, PHOTO_ACCEPT } from '#lib/heic';
	let {
		files = $bindable<File[]>([]),
		max = 5,
		capture = false
	}: { files?: File[]; max?: number; capture?: boolean } = $props();
	/** One blob URL per File, created when it first appears and revoked when it leaves the list. */
	const urls = new Map<File, string>();
	let previews = $state<string[]>([]);
	$effect(() => {
		for (const f of files) if (!urls.has(f)) urls.set(f, URL.createObjectURL(f));
		for (const [f, url] of urls)
			if (!files.includes(f)) {
				URL.revokeObjectURL(url);
				urls.delete(f);
			}
		previews = files.map((f) => urls.get(f)!);
	});
	$effect(() => () => {
		for (const url of urls.values()) URL.revokeObjectURL(url);
	});
	let converting = $state(0);
	let error = $state('');

	async function onChange(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		// HEIC from an Android/Chrome gallery often arrives with an empty MIME type.
		const picked = Array.from(input.files ?? []).filter(isAcceptedPhoto);
		input.value = '';
		error = '';
		const room = max - files.length;
		const batch = picked.slice(0, room);
		// Browsers other than Safari can't show a HEIC in <img>, so convert those to JPEG on pick.
		// Upload re-encodes everything anyway, so this costs nothing extra for the JPEG result.
		const heic = batch.filter(isHeicFile);
		converting += heic.length;
		try {
			const ready = await Promise.all(
				batch.map(async (f) => {
					if (!isHeicFile(f)) return f;
					try {
						return await stripAndResize(f);
					} finally {
						converting -= 1;
					}
				})
			);
			files = [...files, ...ready].slice(0, max);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Could not read that photo.';
		}
	}
	const remove = (i: number) => (files = files.filter((_, j) => j !== i));
</script>

<div class="grid grid-cols-3 gap-2">
	{#each previews as src, i (src)}
		<div class="relative aspect-square overflow-hidden rounded-xl bg-neutral-200">
			<img {src} alt="Photo {i + 1}" class="h-full w-full object-cover" />
			<button
				type="button"
				onclick={() => remove(i)}
				aria-label="Remove photo {i + 1}"
				class="absolute top-1 right-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white"
				>×</button
			>
			<span class="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 text-xs text-white"
				>{i + 1}</span
			>
		</div>
	{/each}
	{#each { length: converting } as _, i (i)}
		<div
			class="flex aspect-square animate-pulse items-center justify-center rounded-xl bg-neutral-200 text-xs text-neutral-500"
			aria-live="polite"
		>
			Converting…
		</div>
	{/each}
	{#if files.length + converting < max}
		<label
			class="flex aspect-square cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-neutral-300 text-neutral-500 active:bg-neutral-100"
		>
			<span class="text-3xl leading-none">+</span>
			<span class="mt-1 text-xs">{capture ? 'Take photo' : 'Add photos'}</span>
			<input
				type="file"
				accept={PHOTO_ACCEPT}
				multiple={!capture}
				capture={capture ? 'environment' : undefined}
				class="sr-only"
				onchange={onChange}
			/>
		</label>
	{/if}
</div>
{#if error}
	<p class="mt-2 text-sm text-red-600" role="alert">{error}</p>
{/if}
