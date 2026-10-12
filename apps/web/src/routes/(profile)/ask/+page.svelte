<script lang="ts">
	import { goto } from '$app/navigation';
	import { fade, fly } from 'svelte/transition';
	import RecCard from '#lib/components/RecCard.svelte';
	import Loader from '#lib/components/Loader.svelte';
	import BottomBar from '#lib/components/BottomBar.svelte';
	import { getLocation, recommend, saveCards, startExperience } from '#lib/client';
	import type { Card, RecommendResponse } from '#lib/types';

	const examples = [
		'a run with views of the water and the Empire State Building',
		'somewhere to run that feels like home',
		'a quiet sunset walk by the water'
	];
	let prompt = $state('');
	let busy = $state(false);
	let err = $state('');
	let result = $state<RecommendResponse | null>(null);

	async function ask() {
		if (!prompt.trim() || busy) return;
		busy = true;
		err = '';
		result = null;
		try {
			const loc = await getLocation();
			result = await recommend(prompt.trim(), loc?.lat, loc?.lng);
			saveCards(result);
		} catch (e: any) {
			err = e.message ?? 'Something went wrong';
		} finally {
			busy = false;
		}
	}
	async function start(card: Card) {
		try {
			await startExperience(card.experience_id);
		} catch {
			/* still navigate; timer is client side */
		}
		goto(`/go/${card.experience_id}`);
	}
</script>

<svelte:head><title>Explorin · Ask</title></svelte:head>

{#if busy}
	<Loader stages={['Reading your profile', 'Finding real places', 'Asking people like you']} />
{:else if result}
	<div class="space-y-4 pt-2" in:fade>
		<p class="text-sm text-neutral-500">
			You asked: <span class="text-neutral-800">“{prompt}”</span>
		</p>
		{#if result.feasibility_note}
			<p
				class="rounded-2xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200"
				in:fly={{ y: 8 }}
			>
				{result.feasibility_note}
			</p>
		{/if}
		{#if !result.cards.length}
			<p class="py-10 text-center text-neutral-500">
				Nothing confident enough to recommend. Try rephrasing.
			</p>
		{/if}
		{#each result.cards as card, i (card.experience_id)}<RecCard
				{card}
				index={i}
				onstart={start}
			/>{/each}
		{#if result.attribution === 'google_maps'}
			<p class="text-center text-xs text-neutral-400">
				Places from Google Maps. Quotes labeled by source.
			</p>
		{/if}
	</div>
	<BottomBar>
		<button
			type="button"
			onclick={() => (result = null)}
			class="h-14 w-full rounded-full bg-neutral-900 text-lg font-semibold text-white"
			>Ask something else</button
		>
	</BottomBar>
{:else}
	<div class="pt-6" in:fade>
		<h1 class="text-3xl leading-tight font-semibold">What do you feel like today?</h1>
		<textarea
			bind:value={prompt}
			rows="3"
			placeholder="a run with views of the water and the Empire State Building"
			class="mt-5 w-full resize-none rounded-2xl border border-neutral-300 bg-white p-4 text-base outline-none focus:border-accent"
		></textarea>
		<div class="mt-3 flex flex-wrap gap-2">
			{#each examples as ex, i}
				<button
					type="button"
					onclick={() => (prompt = ex)}
					in:fly={{ y: 8, delay: i * 70 }}
					class="rounded-full bg-white px-3 py-2 text-left text-sm text-neutral-700 ring-1 ring-neutral-200 active:bg-neutral-100"
					>{ex}</button
				>
			{/each}
		</div>
		{#if err}<p class="mt-4 text-sm text-red-600">{err}</p>{/if}
	</div>
	<BottomBar>
		<button
			type="button"
			disabled={!prompt.trim()}
			onclick={ask}
			class="h-14 w-full rounded-full bg-accent text-lg font-semibold text-white active:scale-[0.98] disabled:opacity-40"
			>Find my experience</button
		>
	</BottomBar>
{/if}
