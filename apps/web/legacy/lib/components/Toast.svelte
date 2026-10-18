<script lang="ts">
	import { fly } from 'svelte/transition';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	let {
		message,
		show = $bindable(false),
		duration = 4000
	}: { message: string; show?: boolean; duration?: number } = $props();
	$effect(() => {
		if (!show) return;
		const t = setTimeout(() => (show = false), duration);
		return () => clearTimeout(t);
	});
</script>

{#if show}
	<div
		role="status"
		transition:fly={{ y: -20, duration: 300 }}
		class="fixed top-4 left-1/2 z-30 w-[calc(100%-2rem)] max-w-[398px] -translate-x-1/2 rounded-2xl bg-neutral-900 px-4 py-3 text-sm text-white shadow-lg"
	>
		<Sparkles size={16} class="mr-2 inline-block align-[-3px] text-amber-300" aria-hidden="true" />{message}
	</div>
{/if}
