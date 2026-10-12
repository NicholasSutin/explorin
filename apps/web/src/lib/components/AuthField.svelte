<script lang="ts">
	/** Labelled text input in the app's form style. */
	import type { HTMLInputAttributes } from 'svelte/elements';
	let {
		label,
		value = $bindable(''),
		hint,
		...rest
	}: { label: string; value?: string; hint?: string } & HTMLInputAttributes = $props();
</script>

<label class="block">
	<span class="text-sm font-medium">{label}</span>
	{#if hint}<span class="ml-1 text-xs text-neutral-500">{hint}</span>{/if}
	<input
		bind:value
		{...rest}
		class="mt-1 h-12 w-full rounded-xl border border-neutral-300 bg-white px-4 text-base outline-none focus:border-accent"
	/>
</label>
