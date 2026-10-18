<script lang="ts">
	/**
	 * The scrapbook: every finished day as a page in a cloth-bound book. /scrapbook/<trip id> opens at that day;
	 * right after saving a day (?new=1) the book turns to it and opens the share sheet.
	 */
	import { onMount } from 'svelte';
	import { page as appPage } from '$app/state';
	import { goto } from '$app/navigation';
	import Share from '@lucide/svelte/icons/share';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import Book, { type BookPage } from '#lib/components/scrapbook/Book.svelte';
	import Page from '#lib/components/scrapbook/Page.svelte';
	import Cover from '#lib/components/scrapbook/Cover.svelte';
	import Contents from '#lib/components/scrapbook/Contents.svelte';
	import EndPage from '#lib/components/scrapbook/EndPage.svelte';
	import ShareDialog from '#lib/components/scrapbook/ShareDialog.svelte';
	import { shortDate } from '#lib/scrapbook/layout';
	import type { Trip } from '#lib/adventure';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const trips = $derived(data.trips);
	const pages = $derived<BookPage[]>([
		{ kind: 'cover' },
		{ kind: 'contents' },
		...trips.map((trip) => ({ kind: 'trip' as const, trip })),
		{ kind: 'end' }
	]);
	const pageOf = (id: string) => 2 + trips.findIndex((t) => t.id === id);
	const years = $derived.by(() => {
		const ys = [
			...new Set(trips.map((t) => new Date(t.finishedAt ?? t.createdAt).getFullYear()))
		].sort();
		return ys.length
			? ys.length > 1
				? `${ys[0]}–${ys.at(-1)}`
				: String(ys[0])
			: String(new Date().getFullYear());
	});

	let current = $state(0);
	let book = $state<ReturnType<typeof Book>>();
	let sharing = $state<Trip | null>(null);
	let shareOpen = $state(false);

	/** The day in view: the right-hand page of a spread, else the left one. */
	const inView = $derived.by(() => {
		const at = (i: number) =>
			pages[i]?.kind === 'trip' ? (pages[i] as { trip: Trip }).trip : null;
		return at(current) ?? at(current - 1) ?? null;
	});

	onMount(async () => {
		const id = data.openId;
		if (!id || pageOf(id) < 2) return;
		const target = pageOf(id);
		const fresh = appPage.url.searchParams.has('new');
		if (fresh) {
			// The new day turns into view, then the share sheet offers it.
			await book?.reveal(target);
			setTimeout(() => openShare(trips.find((t) => t.id === id) ?? null), 1300);
			goto(`/scrapbook/${id}`, { state: {}, shallow: true, replace: true });
		} else current = target;
	});

	function openShare(trip: Trip | null) {
		if (!trip) return;
		sharing = trip;
		shareOpen = true;
	}
</script>

<svelte:head><title>Explorin · Scrapbook</title></svelte:head>

<div class="flex flex-col">
	<div class="flex items-end justify-between gap-4">
		<div>
			<p class="text-xs font-semibold tracking-[0.18em] text-orange uppercase">Your scrapbook</p>
			<h1 class="mt-1 font-serif text-4xl font-semibold">Good days, kept.</h1>
		</div>
		{#if inView}
			<button
				type="button"
				onclick={() => openShare(inView)}
				class="flex h-11 shrink-0 items-center gap-2 rounded-full bg-orange px-5 font-semibold text-white shadow-md"
				><Share size={17} aria-hidden="true" />Share</button
			>
		{/if}
	</div>

	<div class="mt-6 h-[min(72dvh,860px)] w-full">
		<Book bind:this={book} {pages} bind:page={current} flip={data.flip}>
			{#snippet render(p, index)}
				{#if p.kind === 'cover'}
					<Cover name={data.name} days={trips.length} {years} />
				{:else if p.kind === 'contents'}
					<Contents
						entries={trips.map((t) => ({
							title: t.storyTitle ?? t.title ?? 'A day out',
							date: shortDate(t.finishedAt),
							page: pageOf(t.id)
						}))}
						onjump={(n) => book?.jump(n)}
					/>
				{:else if p.kind === 'trip'}
					<Page trip={p.trip} pageNumber={index} />
				{:else if p.kind === 'end'}
					<EndPage empty={!trips.length} />
				{:else}
					<div class="h-full w-full bg-[#fbf8ef]"></div>
				{/if}
			{/snippet}
		</Book>
	</div>

	{#if inView}
		<p class="mt-2 flex items-center justify-center gap-1.5 text-center text-sm text-ink/55">
			<MapPin size={14} aria-hidden="true" />
			<a href="/trip/{inView.id}" class="underline-offset-4 hover:underline"
				>See this day on the map</a
			>
		</p>
	{/if}
</div>

{#if sharing}{#key sharing.id}<ShareDialog trip={sharing} bind:open={shareOpen} />{/key}{/if}
