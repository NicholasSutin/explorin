<script lang="ts">
	let {
		files = $bindable<File[]>([]),
		max = 5,
		capture = false
	}: { files?: File[]; max?: number; capture?: boolean } = $props();
	let previews = $derived(files.map((f) => URL.createObjectURL(f)));

	function onChange(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const picked = Array.from(input.files ?? []).filter((f) => f.type.startsWith('image/'));
		files = [...files, ...picked].slice(0, max);
		input.value = '';
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
	{#if files.length < max}
		<label
			class="flex aspect-square cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-neutral-300 text-neutral-500 active:bg-neutral-100"
		>
			<span class="text-3xl leading-none">+</span>
			<span class="mt-1 text-xs">{capture ? 'Take photo' : 'Add photos'}</span>
			<input
				type="file"
				accept="image/*"
				multiple={!capture}
				capture={capture ? 'environment' : undefined}
				class="sr-only"
				onchange={onChange}
			/>
		</label>
	{/if}
</div>
