<script lang="ts">
	/** The inside cover: every day in the book with its page number. Entries jump straight to their page. */
	import { DEFAULT_COVER, coverPalette, type CoverStyle } from '#lib/scrapbook/style';
	let {
		entries,
		onjump,
		style = DEFAULT_COVER
	}: {
		entries: { title: string; date: string; page: number }[];
		onjump: (page: number) => void;
		style?: CoverStyle;
	} = $props();
	const c = $derived(coverPalette(style));
	const shown = $derived(entries.slice(0, 11));
</script>

<svg
	xmlns="http://www.w3.org/2000/svg"
	viewBox="0 0 600 800"
	class="h-full w-full"
	role="img"
	aria-label="Contents"
>
	<rect width="600" height="800" fill={c.endpaper} />
	<text
		x="56"
		y="110"
		font-family="'Iowan Old Style','Palatino Linotype',Georgia,serif"
		font-size="40"
		font-weight="700"
		fill={c.endInk}>Contents</text
	>
	<line x1="56" x2="544" y1="132" y2="132" stroke={c.endInk} stroke-opacity="0.25" />
	{#each shown as e, i (e.page)}
		{@const y = 184 + i * 52}
		<g
			role="link"
			tabindex="0"
			style="cursor: pointer"
			onclick={() => onjump(e.page)}
			onkeydown={(ev) => ev.key === 'Enter' && onjump(e.page)}
		>
			<rect x="48" y={y - 28} width="504" height="48" fill="transparent" />
			<text x="56" {y} font-family="Caveat,'Bradley Hand',cursive" font-size="27" fill={c.endPen}
				>{e.title.length > 34 ? e.title.slice(0, 33) + '…' : e.title}</text
			>
			<text
				x="58"
				y={y + 17}
				font-family="ui-sans-serif,-apple-system,Helvetica,sans-serif"
				font-size="10"
				letter-spacing="1.5"
				fill={c.endInk}
				opacity="0.5">{e.date}</text
			>
			<line
				x1="470"
				x2="520"
				y1={y - 4}
				y2={y - 4}
				stroke={c.endInk}
				stroke-opacity="0.25"
				stroke-dasharray="1 5"
			/>
			<text
				x="544"
				{y}
				text-anchor="end"
				font-family="'Iowan Old Style',Georgia,serif"
				font-size="18"
				fill={c.endInk}>{e.page}</text
			>
		</g>
	{:else}
		<text x="56" y="200" font-family="Caveat,'Bradley Hand',cursive" font-size="30" fill={c.endPen}
			>Nothing here yet. Your first day is waiting.</text
		>
	{/each}
	{#if entries.length > shown.length}
		<text
			x="56"
			y={184 + shown.length * 52}
			font-family="ui-sans-serif,-apple-system,Helvetica,sans-serif"
			font-size="13"
			fill={c.endInk}
			opacity="0.55">…and {entries.length - shown.length} more</text
		>
	{/if}
</svg>
