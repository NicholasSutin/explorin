<svelte:options namespace="svg" />

<script lang="ts" module>
	/**
	 * Contour lines for the topo cover: wobbly rings round one summit, the wobble drifting slowly from ring to ring
	 * so neighbours never cross. Every fifth ring is an index contour, drawn heavier.
	 */
	const TOPO = Array.from({ length: 24 }, (_, k) => {
		const r = 26 + k * 30;
		const pts: string[] = [];
		for (let i = 0; i < 90; i++) {
			const a = (i / 90) * Math.PI * 2;
			const wob =
				1 +
				0.16 * Math.sin(3 * a + k * 0.06) +
				0.09 * Math.sin(5 * a - k * 0.08 + 1) +
				0.05 * Math.sin(9 * a + k * 0.1 + 2);
			pts.push(
				`${(360 + Math.cos(a) * r * wob).toFixed(1)} ${(360 + Math.sin(a) * r * wob * 1.12).toFixed(1)}`
			);
		}
		return { d: `M${pts.join('L')}Z`, index: k % 5 === 4 };
	});

	/** A four-point sparkle of radius `s`, centred at the origin. */
	const sparkle = (s: number) => `M0 ${-s} Q0 0 ${s} 0 Q0 0 0 ${s} Q0 0 ${-s} 0 Q0 0 0 ${-s}Z`;
	const STARS = [
		[22, 30, 13],
		[96, 18, 7],
		[64, 82, 16],
		[132, 98, 8],
		[24, 126, 8],
		[112, 140, 6],
		[146, 38, 5]
	] as const;
</script>

<script lang="ts">
	/** The cloth's printed pattern in cover space (600×800), drawn in `color`; `bg` shows through flower centres. */
	import type { CoverPattern } from '#lib/scrapbook/style';
	let { id, kind, color, bg }: { id: string; kind: CoverPattern; color: string; bg: string } =
		$props();
	const tile = $derived(
		(
			{
				cloth: [10, 10],
				pinstripe: [18, 18],
				gingham: [60, 60],
				polka: [44, 44],
				chevron: [24, 20],
				stars: [160, 160],
				topo: [600, 800],
				flowers: [90, 90]
			} as const
		)[kind]
	);
</script>

<pattern {id} width={tile[0]} height={tile[1]} patternUnits="userSpaceOnUse">
	{#if kind === 'pinstripe'}
		<rect x="8" width="1.8" height="18" fill={color} opacity="0.75" />
	{:else if kind === 'gingham'}
		<rect width="30" height="60" fill={color} opacity="0.32" />
		<rect width="60" height="30" fill={color} opacity="0.32" />
	{:else if kind === 'polka'}
		<circle cx="11" cy="11" r="6.5" fill={color} opacity="0.8" />
		<circle cx="33" cy="33" r="6.5" fill={color} opacity="0.8" />
	{:else if kind === 'chevron'}
		<path
			d="M0 15 L12 5 L24 15"
			fill="none"
			stroke={color}
			stroke-width="3.2"
			stroke-linejoin="miter"
			opacity="0.7"
		/>
	{:else if kind === 'stars'}
		{#each STARS as [x, y, s], i (i)}
			<path d={sparkle(s)} transform="translate({x} {y})" fill={color} opacity="0.9" />
		{/each}
		<circle cx="80" cy="40" r="1.6" fill={color} opacity="0.7" />
		<circle cx="40" cy="96" r="1.4" fill={color} opacity="0.7" />
		<circle cx="150" cy="70" r="1.8" fill={color} opacity="0.7" />
	{:else if kind === 'topo'}
		{#each TOPO as ring, i (i)}
			<path
				d={ring.d}
				fill="none"
				stroke={color}
				stroke-width={ring.index ? 2.6 : 1.3}
				opacity={ring.index ? 0.8 : 0.6}
			/>
		{/each}
	{:else if kind === 'flowers'}
		{#each [[22, 22, 1], [67, 67, 0.7]] as [x, y, k], i (i)}
			<g transform="translate({x} {y}) scale({k})" opacity="0.8">
				{#each [0, 72, 144, 216, 288] as a (a)}
					<ellipse cx="0" cy="-8" rx="5.5" ry="8" fill={color} transform="rotate({a})" />
				{/each}
				<circle r="4" fill={bg} />
			</g>
		{/each}
	{/if}
</pattern>
