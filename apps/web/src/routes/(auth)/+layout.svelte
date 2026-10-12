<script lang="ts">
	/** Phone frame for the account pages: logo, one card, nothing else. */
	import type { LayoutProps } from './$types';
	let { children }: LayoutProps = $props();
</script>

<div class="mx-auto flex min-h-dvh max-w-[430px] flex-col px-5 pt-8 pb-12">
	<a href="/" aria-label="Explorin home" class="inline-flex">
		<img src="/brand/lockup-horizontal-ink.svg" alt="explorin." class="h-6 w-auto" />
	</a>
	<main class="flex-1 pt-10">{@render children()}</main>
	<p class="pt-10 text-center text-xs text-neutral-400">go somewhere. feel something.</p>
</div>
