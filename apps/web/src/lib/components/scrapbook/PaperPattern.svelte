<svelte:options namespace="svg" />

<script lang="ts" module>
	/** Confetti pieces in one 6×6-unit tile: circles, squares and triangles, some in the accent, some in ink. */
	const CONFETTI = [
		{ t: 'c', x: 0.7, y: 0.9, s: 0.16, a: true, r: 0 },
		{ t: 'r', x: 2.6, y: 0.5, s: 0.3, a: false, r: 20 },
		{ t: 'v', x: 4.6, y: 1.4, s: 0.32, a: true, r: 12 },
		{ t: 'c', x: 1.7, y: 2.6, s: 0.1, a: false, r: 0 },
		{ t: 'r', x: 3.6, y: 3.0, s: 0.26, a: true, r: -30 },
		{ t: 'c', x: 5.4, y: 3.6, s: 0.14, a: true, r: 0 },
		{ t: 'v', x: 0.6, y: 4.3, s: 0.28, a: false, r: -18 },
		{ t: 'c', x: 2.4, y: 5.2, s: 0.18, a: true, r: 0 },
		{ t: 'r', x: 4.4, y: 5.3, s: 0.22, a: false, r: 40 }
	] as const;
</script>

<script lang="ts">
	/**
	 * A page's paper pattern as an SVG <pattern>, sized in `unit`s (a thirtieth of the page width). Rendered inside the
	 * page's own <defs> so the exported PNG carries it too.
	 */
	import type { PaperPattern } from '#lib/scrapbook/style';
	let {
		id,
		kind,
		unit,
		ink,
		rule,
		accent
	}: { id: string; kind: PaperPattern; unit: number; ink: string; rule: string; accent: string } =
		$props();
	const u = $derived(unit);
	const size = $derived(
		kind === 'confetti'
			? { w: u * 6, h: u * 6 }
			: kind === 'lines'
				? { w: u * 4, h: u * 1.3 }
				: kind === 'gingham' || kind === 'stripes'
					? { w: u * 2, h: u * 2 }
					: { w: u, h: u }
	);
</script>

<pattern {id} width={size.w} height={size.h} patternUnits="userSpaceOnUse">
	{#if kind === 'dots'}
		<circle cx={u / 2} cy={u / 2} r={u / 20} fill={ink} opacity="0.13" />
	{:else if kind === 'grid'}
		<path
			d="M {u} 0 V {u} M 0 {u} H {u}"
			fill="none"
			stroke={ink}
			stroke-opacity="0.1"
			stroke-width={u / 24}
		/>
	{:else if kind === 'lines'}
		<line
			x1="0"
			x2={size.w}
			y1={size.h - u / 20}
			y2={size.h - u / 20}
			stroke={rule}
			stroke-opacity="0.3"
			stroke-width={u / 24}
		/>
	{:else if kind === 'gingham'}
		<rect width={u} height={size.h} fill={accent} opacity="0.075" />
		<rect width={size.w} height={u} fill={accent} opacity="0.075" />
	{:else if kind === 'stripes'}
		<rect width={u * 0.8} height={size.h} fill={accent} opacity="0.08" />
	{:else if kind === 'confetti'}
		{#each CONFETTI as c, i (i)}
			{@const fill = c.a ? accent : ink}
			{@const op = c.a ? 0.4 : 0.16}
			{#if c.t === 'c'}
				<circle cx={c.x * u} cy={c.y * u} r={c.s * u} {fill} opacity={op} />
			{:else if c.t === 'r'}
				<rect
					x={c.x * u - c.s * u}
					y={c.y * u - (c.s * u) / 2.4}
					width={c.s * u * 2}
					height={(c.s * u) / 1.2}
					rx={(c.s * u) / 4}
					{fill}
					opacity={op}
					transform="rotate({c.r} {c.x * u} {c.y * u})"
				/>
			{:else}
				<path
					d="M {c.x * u} {c.y * u - c.s * u} L {c.x * u + c.s * u} {c.y * u +
						c.s * u * 0.7} L {c.x * u - c.s * u} {c.y * u + c.s * u * 0.7} Z"
					{fill}
					opacity={op}
					transform="rotate({c.r} {c.x * u} {c.y * u})"
				/>
			{/if}
		{/each}
	{/if}
</pattern>
