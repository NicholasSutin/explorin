<script lang="ts">
	import './layout.css';
	import type { LayoutProps } from './$types';
	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href="/brand/favicon.svg" />
</svelte:head>

{@render children()}
