<script lang="ts">
	import { sourceLabel, type Quote } from '#lib/types';
	let { quote }: { quote: Quote } = $props();
	let isUser = $derived(quote.source === 'user');
</script>

<figure class="rounded-2xl p-3 {isUser ? 'bg-accent/10' : 'bg-neutral-100'}">
	<blockquote class="text-[15px] leading-snug text-neutral-900">“{quote.quote}”</blockquote>
	<figcaption class="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-600">
		<span class="font-medium">{quote.display_name}</span>
		<span
			class="rounded-full px-2 py-0.5 {isUser
				? 'bg-accent text-white'
				: 'bg-neutral-200 text-neutral-700'}">{sourceLabel(quote.source)}</span
		>
		{#each quote.emotions.slice(0, 2) as e}<span class="text-neutral-500">#{e}</span>{/each}
	</figcaption>
</figure>
