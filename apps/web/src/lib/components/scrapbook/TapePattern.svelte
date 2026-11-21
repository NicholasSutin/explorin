<svelte:options namespace="svg" />

<script lang="ts">
	/**
	 * Washi tape fill: the tape colour with its print. Used as the tape strips' fill, in the strip's own rotated
	 * coordinates, so stripes run along the tape.
	 */
	import type { TapePattern } from '#lib/scrapbook/style';
	let {
		id,
		kind,
		unit,
		base,
		mark
	}: { id: string; kind: TapePattern; unit: number; base: string; mark: string } = $props();
	const u = $derived(unit);
</script>

<pattern
	{id}
	width={u}
	height={u}
	patternUnits="userSpaceOnUse"
	patternTransform={kind === 'stripes' ? 'rotate(45)' : undefined}
>
	<rect width={u} height={u} fill={base} />
	{#if kind === 'stripes'}
		<rect width={u * 0.45} height={u} fill={mark} opacity="0.75" />
	{:else if kind === 'dots'}
		<circle cx={u * 0.25} cy={u * 0.25} r={u * 0.13} fill={mark} opacity="0.8" />
		<circle cx={u * 0.75} cy={u * 0.75} r={u * 0.13} fill={mark} opacity="0.8" />
	{:else if kind === 'checks'}
		<path
			d="M {u / 2} 0 V {u} M 0 {u / 2} H {u}"
			stroke={mark}
			stroke-width={u * 0.14}
			opacity="0.6"
		/>
	{/if}
</pattern>
