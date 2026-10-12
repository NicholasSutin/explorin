<script lang="ts">
	import { fade } from 'svelte/transition';
	let { stages, intervalMs = 2800 }: { stages: string[]; intervalMs?: number } = $props();
	let i = $state(0);
	$effect(() => {
		const t = setInterval(() => (i = Math.min(i + 1, stages.length - 1)), intervalMs);
		return () => clearInterval(t);
	});
</script>

<div class="flex flex-col items-center gap-4 py-16 text-center" in:fade>
	<div
		class="h-10 w-10 animate-spin rounded-full border-4 border-neutral-200 border-t-accent"
	></div>
	{#key i}<p class="text-neutral-700" in:fade={{ duration: 200 }}>{stages[i]}…</p>{/key}
</div>
