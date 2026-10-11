<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import BottomBar from '#lib/components/BottomBar.svelte';
	import { finishExperience, loadCards } from '#lib/client';

	const id = $derived(page.params.experienceId!);
	let card = $derived(loadCards()?.cards.find((c) => c.experience_id === id) ?? null);
	let startedAt = $state(Date.now());
	let now = $state(Date.now());
	let busy = $state(false);
	let elapsed = $derived(Math.max(0, Math.floor((now - startedAt) / 1000)));
	const pad = (n: number) => String(n).padStart(2, '0');
	let clock = $derived(`${pad(Math.floor(elapsed / 60))}:${pad(elapsed % 60)}`);

	onMount(() => {
		const key = `felt:start:${id}`;
		const saved = sessionStorage.getItem(key);
		if (saved) startedAt = Number(saved);
		else sessionStorage.setItem(key, String(startedAt));
		const t = setInterval(() => (now = Date.now()), 1000);
		return () => clearInterval(t);
	});

	async function finish() {
		busy = true;
		try {
			await finishExperience(id);
		} catch {
			/* reflect endpoint also marks finished */
		}
		goto(`/reflect/${id}`);
	}
</script>

<svelte:head><title>Felt · Go</title></svelte:head>

<div class="flex min-h-[70dvh] flex-col items-center justify-center text-center" in:fade>
	<p class="text-sm font-medium tracking-wide text-accent-dark uppercase">
		{card?.place_name ?? 'Your experience'}
	</p>
	<h1 class="mt-2 text-2xl font-semibold">{card?.title ?? 'Enjoy it'}</h1>
	<p class="mt-10 font-mono text-7xl font-light tabular-nums">{clock}</p>
	<p class="mt-3 text-neutral-500">Put the phone away. Come back when you're done.</p>
	{#if card?.maps_url}<a
			href={card.maps_url}
			target="_blank"
			rel="noopener"
			class="mt-6 text-sm text-accent-dark underline">Open in Maps</a
		>{/if}
</div>
<BottomBar>
	<button
		type="button"
		disabled={busy}
		onclick={finish}
		class="h-14 w-full rounded-full bg-neutral-900 text-lg font-semibold text-white active:scale-[0.98]"
		>Finish</button
	>
</BottomBar>
