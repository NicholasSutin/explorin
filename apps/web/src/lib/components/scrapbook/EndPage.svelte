<script lang="ts">
	/** The last page: room for the next day. */
	let { empty = false }: { empty?: boolean } = $props();
</script>

<svg
	xmlns="http://www.w3.org/2000/svg"
	viewBox="0 0 600 800"
	class="h-full w-full"
	role="img"
	aria-label="End of the book"
>
	<rect width="600" height="800" fill="#fbf8ef" />
	{#each { length: 14 } as _, i (i)}
		<line
			x1="56"
			x2="544"
			y1={240 + i * 34}
			y2={240 + i * 34}
			stroke="#7d9bb5"
			stroke-opacity="0.28"
		/>
	{/each}
	<text
		x="300"
		y="170"
		text-anchor="middle"
		font-family="Caveat,'Bradley Hand',cursive"
		font-size="44"
		fill="#26385a">{empty ? 'Your first page is waiting…' : 'To be continued…'}</text
	>
	<a href="/">
		<rect x="190" y="660" width="220" height="54" rx="27" fill="#d96738" />
		<text
			x="300"
			y="694"
			text-anchor="middle"
			font-family="ui-sans-serif,-apple-system,Helvetica,sans-serif"
			font-size="18"
			font-weight="700"
			fill="#ffffff">Plan a day →</text
		>
	</a>
</svg>
