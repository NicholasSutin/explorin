<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { fade, fly } from 'svelte/transition';
	import PhotoPicker from '#lib/components/PhotoPicker.svelte';
	import BottomBar from '#lib/components/BottomBar.svelte';
	import Loader from '#lib/components/Loader.svelte';
	import Toast from '#lib/components/Toast.svelte';
	import { loadCards, reflect, uploadPhotos } from '#lib/client';
	import type { ReflectionAnalysis } from '#lib/types';

	const id = $derived(page.params.experienceId!);
	let card = $derived(loadCards()?.cards.find((c) => c.experience_id === id) ?? null);
	let text = $state('');
	let files = $state<File[]>([]);
	let consent = $state(true);
	let busy = $state(false);
	let err = $state('');
	let result = $state<ReflectionAnalysis | null>(null);
	let toast = $state(false);

	async function submit() {
		if (text.trim().length < 3 || busy) return;
		busy = true;
		err = '';
		try {
			const urls = files.length ? await uploadPhotos(files) : [];
			result = await reflect(id, text.trim(), urls, consent);
			toast = true;
		} catch (e: any) {
			err = e.message ?? 'Something went wrong';
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>Explorin · Reflect</title></svelte:head>

{#if result}
	<Toast message={result.learned} bind:show={toast} />
	<div class="pt-8" in:fade>
		<p class="text-sm font-medium tracking-wide text-accent-dark uppercase">
			{card?.place_name ?? 'Your experience'}
		</p>
		<h1 class="mt-1 text-2xl font-semibold">Thanks for sharing how it felt.</h1>
		<div class="mt-5 flex flex-wrap gap-2">
			{#each result.emotions as e, i (e)}
				<span
					in:fly={{ y: 8, delay: i * 80 }}
					class="rounded-full bg-accent/10 px-3 py-2 text-sm font-medium text-accent-dark">{e}</span
				>
			{/each}
			{#each result.themes as t, i (t)}
				<span
					in:fly={{ y: 8, delay: 200 + i * 80 }}
					class="rounded-full bg-neutral-100 px-3 py-2 text-sm text-neutral-700">#{t}</span
				>
			{/each}
		</div>
		<figure
			class="mt-6 rounded-2xl bg-white p-4 ring-1 ring-neutral-200"
			in:fly={{ y: 12, delay: 300 }}
		>
			<blockquote class="text-[17px] leading-snug">“{result.quote}”</blockquote>
			<figcaption class="mt-2 text-xs text-neutral-500">
				{consent ? 'This line can now be quoted for someone like you.' : 'Kept private.'}
			</figcaption>
		</figure>
	</div>
	<BottomBar>
		<div class="flex gap-3">
			<a
				href="/profile"
				class="flex h-14 flex-1 items-center justify-center rounded-full bg-neutral-100 font-semibold text-neutral-900"
				>See profile</a
			>
			<a
				href="/ask"
				class="flex h-14 flex-1 items-center justify-center rounded-full bg-accent font-semibold text-white"
				>Ask again</a
			>
		</div>
	</BottomBar>
{:else if busy}
	<Loader stages={['Looking at your photo', 'Reading how it felt', 'Updating your profile']} />
{:else}
	<div class="pt-6" in:fade>
		<p class="text-sm font-medium tracking-wide text-accent-dark uppercase">
			{card?.place_name ?? 'Your experience'}
		</p>
		<h1 class="mt-1 text-3xl leading-tight font-semibold">How did it make you feel?</h1>
		<div class="mt-5"><PhotoPicker bind:files max={1} capture /></div>
		<textarea
			bind:value={text}
			rows="4"
			placeholder="Honestly, it reminded me of running with my dad…"
			class="mt-4 w-full resize-none rounded-2xl border border-neutral-300 bg-white p-4 text-base outline-none focus:border-accent"
		></textarea>
		<label
			class="mt-4 flex items-center justify-between rounded-2xl bg-white p-4 ring-1 ring-neutral-200"
		>
			<span class="text-sm"
				><span class="font-medium">Share with people like me</span><br /><span
					class="text-neutral-500">Only one quoted line, with your first name.</span
				></span
			>
			<input type="checkbox" bind:checked={consent} class="h-6 w-6 accent-[#0f766e]" />
		</label>
		{#if err}<p class="mt-4 text-sm text-red-600">{err}</p>{/if}
	</div>
	<BottomBar>
		<button
			type="button"
			disabled={text.trim().length < 3}
			onclick={submit}
			class="h-14 w-full rounded-full bg-accent text-lg font-semibold text-white active:scale-[0.98] disabled:opacity-40"
			>Save how it felt</button
		>
	</BottomBar>
{/if}
