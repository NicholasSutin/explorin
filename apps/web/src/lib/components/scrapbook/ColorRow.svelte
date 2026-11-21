<script lang="ts">
	/** A row of colour swatches plus a custom colour (the native picker behind a rainbow chip). */
	import Check from '@lucide/svelte/icons/check';
	import { readable, type Swatch } from '#lib/scrapbook/style';

	let {
		label,
		value,
		swatches,
		onpick
	}: { label: string; value: string; swatches: Swatch[]; onpick: (hex: string) => void } = $props();
	const custom = $derived(!swatches.some((s) => s.hex === value));
	const tick = (bg: string) => readable(bg, '#203d32', '#ffffff');
</script>

<div role="radiogroup" aria-label={label} class="flex flex-wrap gap-2">
	{#each swatches as s (s.hex)}
		<button
			type="button"
			role="radio"
			aria-checked={value === s.hex}
			aria-label={s.name}
			title={s.name}
			onclick={() => onpick(s.hex)}
			class="flex h-8 w-8 items-center justify-center rounded-full ring-1 ring-ink/15 transition-transform hover:scale-110 {value ===
			s.hex
				? 'ring-2 ring-ink ring-offset-2 ring-offset-paper'
				: ''}"
			style="background: {s.hex}"
		>
			{#if value === s.hex}<Check
					size={15}
					strokeWidth={3}
					color={tick(s.hex)}
					aria-hidden="true"
				/>{/if}
		</button>
	{/each}
	<label
		class="relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-full ring-1 ring-ink/15 transition-transform focus-within:ring-2 focus-within:ring-orange hover:scale-110 {custom
			? 'ring-2 ring-ink ring-offset-2 ring-offset-paper'
			: ''}"
		style="background: {custom
			? value
			: 'conic-gradient(#e5484d, #f5a524, #f2e35a, #46a758, #3e8fd6, #8e4ec6, #e5484d)'}"
		title="Custom color"
	>
		<span class="sr-only">Custom {label.toLowerCase()} color</span>
		{#if custom}<Check size={15} strokeWidth={3} color={tick(value)} aria-hidden="true" />{/if}
		<input
			type="color"
			{value}
			oninput={(e) => onpick(e.currentTarget.value.toLowerCase())}
			class="absolute inset-0 h-full w-full cursor-pointer opacity-0"
		/>
	</label>
</div>
