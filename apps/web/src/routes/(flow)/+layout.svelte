<script lang="ts">
	/** Full-screen phone frame for the in-adventure pages: no tab header. */
	import type { LayoutProps } from './$types';
	let { children }: LayoutProps = $props();
</script>

<div class="mx-auto flex min-h-dvh max-w-[430px] flex-col">
	<main class="flex-1 px-4 pb-32">{@render children()}</main>
</div>
