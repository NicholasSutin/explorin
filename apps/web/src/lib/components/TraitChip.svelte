<script lang="ts">
	import { fly } from 'svelte/transition';
	let {
		label,
		evidence,
		confidence,
		tone = 'neutral',
		delay = 0
	}: {
		label: string;
		evidence?: string;
		confidence?: number;
		tone?: 'accent' | 'neutral';
		delay?: number;
	} = $props();
	let open = $state(false);
</script>

<button
	type="button"
	onclick={() => (open = !open)}
	in:fly={{ y: 8, duration: 250, delay }}
	class="rounded-full px-3 py-2 text-sm font-medium transition
		{tone === 'accent' ? 'bg-accent/10 text-accent-dark' : 'bg-neutral-100 text-neutral-800'}
		{evidence ? 'active:scale-95' : ''}"
>
	{label}{#if confidence != null}<span class="ml-1 opacity-60">{Math.round(confidence * 100)}%</span
		>{/if}
</button>
{#if open && evidence}
	<p class="basis-full text-xs text-neutral-500" in:fly={{ y: -4, duration: 150 }}>
		Evidence: {evidence}
	</p>
{/if}
