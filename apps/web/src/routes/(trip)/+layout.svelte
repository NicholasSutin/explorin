<script lang="ts">
	/** Trip screens are full-bleed: no app header or tab bar over the map. */
	import type { LayoutProps } from './$types';
	let { children }: LayoutProps = $props();
</script>

{@render children()}
