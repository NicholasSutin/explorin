<script lang="ts">
	import type { Snippet } from 'svelte';
	let { children }: { children: Snippet } = $props();
</script>

<div
	class="fixed inset-x-0 bottom-0 z-20 border-t border-neutral-200 bg-white/95 [padding-bottom:env(safe-area-inset-bottom)] backdrop-blur"
>
	<div class="mx-auto max-w-[430px] p-4">{@render children()}</div>
</div>
