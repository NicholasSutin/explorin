<script lang="ts">
	/**
	 * Hand one stop to the phone's maps app. Apple devices get Apple Maps first; everyone gets Google Maps.
	 * Far stops switch to transit directions. `onopen` lets the trip remember where you are heading.
	 */
	import { onMount } from 'svelte';
	import Navigation from '@lucide/svelte/icons/navigation';
	import { directionsLinks, type LatLng } from '#lib/adventure';
	import { prefersAppleMaps } from '#lib/client';
	let {
		to,
		name,
		placeId,
		transit = false,
		compact = false,
		onopen
	}: {
		to: LatLng;
		name: string;
		placeId?: string;
		transit?: boolean;
		compact?: boolean;
		onopen?: () => void;
	} = $props();
	let apple = $state(false);
	onMount(() => (apple = prefersAppleMaps()));
	const links = $derived(directionsLinks(to, { placeId, name, transit }));
	const options = $derived(
		apple
			? [
					{ href: links.apple, label: 'Apple Maps' },
					{ href: links.google, label: 'Google Maps' }
				]
			: [
					{ href: links.google, label: 'Google Maps' },
					{ href: links.apple, label: 'Apple Maps' }
				]
	);
</script>

<div class="flex gap-2">
	{#each options as o, i (o.label)}
		<a
			href={o.href}
			target="_blank"
			rel="noopener noreferrer"
			onclick={() => onopen?.()}
			class="flex flex-1 items-center justify-center gap-1.5 rounded-full text-sm font-semibold {compact
				? 'h-10'
				: 'h-12'} {i === 0 ? 'bg-ink text-cream' : 'bg-white text-ink ring-1 ring-ink/20'}"
		>
			{#if i === 0}<Navigation size={15} aria-hidden="true" />{/if}{o.label}
		</a>
	{/each}
</div>
{#if transit}<p class="mt-1.5 text-center text-xs text-ink/55">
		A bit far to walk, so these open transit directions.
	</p>{/if}
