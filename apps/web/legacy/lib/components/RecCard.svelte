<script lang="ts">
	import { fly } from 'svelte/transition';
	import QuoteBubble from './QuoteBubble.svelte';
	import type { Card } from '#lib/types';
	let {
		card,
		index = 0,
		onstart
	}: { card: Card; index?: number; onstart: (c: Card) => void } = $props();
</script>

<article
	class="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-neutral-200"
	in:fly={{ y: 24, duration: 350, delay: index * 120 }}
>
	<div class="bg-gradient-to-br from-accent to-accent-dark p-5 text-white">
		<p class="text-xs font-medium tracking-wide uppercase opacity-80">{card.place_name}</p>
		<h2 class="mt-1 text-2xl leading-tight font-semibold">{card.title}</h2>
	</div>
	<div class="space-y-4 p-5">
		<p class="text-[15px] leading-relaxed text-neutral-800">{card.plan}</p>
		<section>
			<h3 class="text-xs font-semibold tracking-wide text-neutral-500 uppercase">
				Why this is for you
			</h3>
			<p class="mt-1 text-[15px] leading-relaxed">{card.why_for_you}</p>
		</section>
		{#if card.quotes.length}
			<section class="space-y-2">
				<h3 class="text-xs font-semibold tracking-wide text-neutral-500 uppercase">
					How it felt for others
				</h3>
				{#each card.quotes as q (q.id)}<QuoteBubble quote={q} />{/each}
			</section>
		{/if}
		{#if card.right_now}
			<p class="flex items-center gap-2 text-sm text-neutral-700">
				<span class="h-2 w-2 rounded-full bg-emerald-500"></span>Right now: {card.right_now}
			</p>
		{/if}
		<div class="flex items-center gap-3 pt-1">
			<button
				type="button"
				onclick={() => onstart(card)}
				class="flex h-12 flex-1 items-center justify-center rounded-full bg-neutral-900 font-semibold text-white active:scale-[0.98]"
				>Start</button
			>
			{#if card.maps_url}
				<a
					href={card.maps_url}
					target="_blank"
					rel="noopener"
					class="flex h-12 items-center rounded-full px-4 text-sm font-medium text-accent-dark underline-offset-2 hover:underline"
					>Open in Maps</a
				>
			{/if}
		</div>
	</div>
</article>
