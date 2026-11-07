<script lang="ts">
	/** The inside cover: every day in the book with its page number. Entries jump straight to their page. */
	let {
		entries,
		onjump
	}: { entries: { title: string; date: string; page: number }[]; onjump: (page: number) => void } =
		$props();
	const shown = $derived(entries.slice(0, 11));
</script>

<svg
	xmlns="http://www.w3.org/2000/svg"
	viewBox="0 0 600 800"
	class="h-full w-full"
	role="img"
	aria-label="Contents"
>
	<rect width="600" height="800" fill="#f4eedc" />
	<text
		x="56"
		y="110"
		font-family="'Iowan Old Style','Palatino Linotype',Georgia,serif"
		font-size="40"
		font-weight="700"
		fill="#203d32">Contents</text
	>
	<line x1="56" x2="544" y1="132" y2="132" stroke="#203d32" stroke-opacity="0.25" />
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
			<text x="56" {y} font-family="Caveat,'Bradley Hand',cursive" font-size="27" fill="#26385a"
				>{e.title.length > 34 ? e.title.slice(0, 33) + '…' : e.title}</text
			>
			<text
				x="58"
				y={y + 17}
				font-family="ui-sans-serif,-apple-system,Helvetica,sans-serif"
				font-size="10"
				letter-spacing="1.5"
				fill="#203d32"
				opacity="0.5">{e.date}</text
			>
			<line
				x1="470"
				x2="520"
				y1={y - 4}
				y2={y - 4}
				stroke="#203d32"
				stroke-opacity="0.25"
				stroke-dasharray="1 5"
			/>
			<text
				x="544"
				{y}
				text-anchor="end"
				font-family="'Iowan Old Style',Georgia,serif"
				font-size="18"
				fill="#203d32">{e.page}</text
			>
		</g>
	{:else}
		<text x="56" y="200" font-family="Caveat,'Bradley Hand',cursive" font-size="30" fill="#26385a"
			>Nothing here yet. Your first day is waiting.</text
		>
	{/each}
	{#if entries.length > shown.length}
		<text
			x="56"
			y={184 + shown.length * 52}
			font-family="ui-sans-serif,-apple-system,Helvetica,sans-serif"
			font-size="13"
			fill="#203d32"
			opacity="0.55">…and {entries.length - shown.length} more</text
		>
	{/if}
</svg>
