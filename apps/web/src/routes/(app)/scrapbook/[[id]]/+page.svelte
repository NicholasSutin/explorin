<script lang="ts">
	/**
	 * The scrapbook: every finished day as a page in a cloth-bound book. /scrapbook/<trip id> opens at that day;
	 * right after saving a day (?new=1) the book turns to it and opens the share sheet. "Customize" decorates the
	 * page in view or the cover; changes show at once and save in the background.
	 */
	import { onMount } from 'svelte';
	import { page as appPage } from '$app/state';
	import { goto } from '$app/navigation';
	import Share from '@lucide/svelte/icons/share';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import Palette from '@lucide/svelte/icons/palette';
	import Book, { type BookPage } from '#lib/components/scrapbook/Book.svelte';
	import Page from '#lib/components/scrapbook/Page.svelte';
	import Cover from '#lib/components/scrapbook/Cover.svelte';
	import Contents from '#lib/components/scrapbook/Contents.svelte';
	import EndPage from '#lib/components/scrapbook/EndPage.svelte';
	import ShareDialog from '#lib/components/scrapbook/ShareDialog.svelte';
	import Customizer from '#lib/components/scrapbook/Customizer.svelte';
	import { shortDate } from '#lib/scrapbook/layout';
	import {
		DEFAULT_COVER,
		cleanCoverStyle,
		cleanPageStyle,
		coverPalette,
		resolveCover,
		resolvePage,
		type CoverStyle,
		type PageStyle
	} from '#lib/scrapbook/style';
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
	let visible = $state<number[]>([0]);
	let book = $state<ReturnType<typeof Book>>();
	let sharing = $state<Trip | null>(null);
	let shareOpen = $state(false);

	// The look: the cover, the look for pages without their own, and each page's own (by trip id).
	// svelte-ignore state_referenced_locally
	let cover = $state<CoverStyle>(resolveCover(data.look.cover));
	// svelte-ignore state_referenced_locally
	let pageDefault = $state<Partial<PageStyle>>(data.look.pageDefault);
	// svelte-ignore state_referenced_locally
	let own = $state<Record<string, Partial<PageStyle>>>(data.look.pages);
	const styleOf = (id: string) => resolvePage(pageDefault, own[id]);
	/** What the cover shows while the title box is being typed in (empty → the default title). */
	const shownCover = $derived({ ...cover, title: cover.title.trim() || DEFAULT_COVER.title });
	const cpal = $derived(coverPalette(shownCover));

	const tripAt = (i: number) =>
		pages[i]?.kind === 'trip' ? (pages[i] as { trip: Trip }).trip : null;
	/** Days in view, left to right. */
	const daysInView = $derived(visible.filter((i) => tripAt(i)));

	// Customizing: which tab, and which page of an open spread was picked (default: the right-hand day).
	let customizing = $state(false);
	let tab = $state<'page' | 'cover'>('page');
	let picked = $state<number | null>(null);
	const target = $derived(
		picked !== null && daysInView.includes(picked) ? picked : (daysInView.at(-1) ?? null)
	);
	const targetTrip = $derived(target !== null ? tripAt(target) : null);

	/** The day in view: the picked or right-hand page of a spread, else the left one. */
	const inView = $derived(targetTrip);

	onMount(() => {
		const id = data.openId;
		const flushOnHide = () => flush();
		addEventListener('pagehide', flushOnHide);
		if (id && pageOf(id) >= 2) {
			const target = pageOf(id);
			if (appPage.url.searchParams.has('new')) {
				// The new day turns into view, then the share sheet offers it.
				book?.reveal(target).then(() => {
					setTimeout(() => openShare(trips.find((t) => t.id === id) ?? null), 1300);
					goto(`/scrapbook/${id}`, { state: {}, shallow: true, replace: true });
				});
			} else current = target;
		}
		return () => {
			removeEventListener('pagehide', flushOnHide);
			flush();
		};
	});

	function openShare(trip: Trip | null) {
		if (!trip) return;
		sharing = trip;
		shareOpen = true;
	}

	// ----- Saving: each target (a page, the cover, the book's page look) saves 500 ms after its last change, one
	// request at a time per target so an older look can't land after a newer one.
	let saveState = $state<'idle' | 'saving' | 'saved' | 'error'>('idle');
	const timers = new Map<string, { timer: ReturnType<typeof setTimeout>; run: () => void }>();
	const chains = new Map<string, Promise<void>>();
	let inflight = 0;

	function queue(key: string, url: string, method: 'PUT' | 'PATCH', body: unknown) {
		const prev = timers.get(key);
		if (prev) clearTimeout(prev.timer);
		const run = () => {
			timers.delete(key);
			inflight++;
			saveState = 'saving';
			const next = (chains.get(key) ?? Promise.resolve()).then(async () => {
				try {
					const res = await fetch(url, {
						method,
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify(body),
						keepalive: true
					});
					if (!res.ok) throw new Error(String(res.status));
					if (--inflight === 0 && saveState !== 'error') saveState = 'saved';
				} catch {
					inflight--;
					saveState = 'error';
				}
			});
			chains.set(key, next);
		};
		timers.set(key, { timer: setTimeout(run, 500), run });
	}
	/** Send every pending change now. */
	function flush() {
		for (const { timer, run } of [...timers.values()]) {
			clearTimeout(timer);
			run();
		}
		return Promise.all(chains.values());
	}

	function editPage(patch: Partial<PageStyle>) {
		if (!targetTrip) return;
		const id = targetTrip.id;
		if (saveState === 'error') saveState = 'idle';
		own[id] = { ...styleOf(id), ...patch };
		const style = cleanPageStyle($state.snapshot(own[id]));
		queue(`page:${id}`, `/api/trip/${id}/style`, 'PUT', { style });
	}
	function resetPage() {
		if (!targetTrip) return;
		const id = targetTrip.id;
		delete own[id];
		queue(`page:${id}`, `/api/trip/${id}/style`, 'PUT', { style: {} });
	}
	async function applyToAll() {
		if (!targetTrip) return;
		const look = cleanPageStyle(styleOf(targetTrip.id));
		pageDefault = look;
		own = {};
		// Earlier page saves land first, so none of them re-pins a page after the reset.
		await flush();
		queue('book:pages', '/api/scrapbook', 'PATCH', { pageDefault: look, resetPages: true });
	}
	function editCover(patch: Partial<CoverStyle>) {
		if (saveState === 'error') saveState = 'idle';
		cover = { ...cover, ...patch };
		queue('book:cover', '/api/scrapbook', 'PATCH', {
			cover: cleanCoverStyle($state.snapshot(cover))
		});
	}
	function resetCover() {
		cover = { ...DEFAULT_COVER };
		queue('book:cover', '/api/scrapbook', 'PATCH', { cover: {} });
	}

	function setTab(t: 'page' | 'cover') {
		tab = t;
		if (t === 'cover' && !visible.includes(0)) book?.jump(0);
		if (t === 'page' && !daysInView.length && trips.length) book?.jump(2);
	}
	function openCustomizer() {
		if (customizing) return closeCustomizer();
		customizing = true;
		picked = null;
		tab = daysInView.length ? 'page' : 'cover';
		if (window.matchMedia('(max-width: 1023px)').matches)
			window.scrollTo({ top: 0, behavior: 'smooth' });
	}
	/** The picked page stays picked, so Share offers the day just decorated while it is in view. */
	function closeCustomizer() {
		customizing = false;
		flush();
	}
	/** A tap on a page while customizing: a day picks that page, anything else the cover. */
	function pick(index: number) {
		if (tripAt(index)) {
			picked = index;
			tab = 'page';
		} else tab = 'cover';
	}
</script>

<svelte:head><title>Explorin · Scrapbook</title></svelte:head>

<div class="flex flex-col">
	<div class="flex items-end justify-between gap-4">
		<div class={customizing ? 'max-lg:hidden' : ''}>
			<p class="text-xs font-semibold tracking-[0.18em] text-orange uppercase">Your scrapbook</p>
			<h1 class="mt-1 font-serif text-4xl font-semibold">Good days, kept.</h1>
		</div>
		<div class="flex shrink-0 gap-2 {customizing ? 'max-lg:ml-auto' : ''}">
			<button
				type="button"
				onclick={openCustomizer}
				aria-pressed={customizing}
				class="flex h-11 items-center gap-2 rounded-full px-4 font-semibold ring-1 transition sm:px-5 {customizing
					? 'bg-ink text-cream ring-ink'
					: 'bg-paper ring-ink/15 hover:bg-moss'}"
				><Palette size={17} aria-hidden="true" />Customize</button
			>
			{#if inView}
				<button
					type="button"
					onclick={() => openShare(inView)}
					class="flex h-11 items-center gap-2 rounded-full bg-orange px-4 font-semibold text-white shadow-md sm:px-5"
					><Share size={17} aria-hidden="true" />Share</button
				>
			{/if}
		</div>
	</div>

	<div class="mt-6 lg:flex lg:items-start lg:gap-6">
		<div class="min-w-0 flex-1">
			<div
				class="w-full {customizing
					? 'h-[calc(56dvh-8rem)] lg:h-[min(72dvh,860px)]'
					: 'h-[min(72dvh,860px)]'}"
			>
				<Book
					bind:this={book}
					{pages}
					bind:page={current}
					bind:visible
					flip={data.flip}
					endpaper={cpal.endpaper}
					edge={cpal.edge}
					selected={customizing && tab === 'page' && target !== null ? [target] : []}
					onpick={customizing ? pick : undefined}
				>
					{#snippet render(p, index)}
						{#if p.kind === 'cover'}
							<Cover name={data.name} days={trips.length} {years} style={shownCover} />
						{:else if p.kind === 'contents'}
							<Contents
								style={shownCover}
								entries={trips.map((t) => ({
									title: t.storyTitle ?? t.title ?? 'A day out',
									date: shortDate(t.finishedAt),
									page: pageOf(t.id)
								}))}
								onjump={(n) => book?.jump(n)}
							/>
						{:else if p.kind === 'trip'}
							<Page trip={p.trip} style={styleOf(p.trip.id)} pageNumber={index} />
						{:else if p.kind === 'end'}
							<EndPage empty={!trips.length} style={shownCover} />
						{:else}
							<div class="h-full w-full" style="background: {cpal.endpaper}"></div>
						{/if}
					{/snippet}
				</Book>
			</div>

			{#if inView && !customizing}
				<p class="mt-2 flex items-center justify-center gap-1.5 text-center text-sm text-ink/55">
					<MapPin size={14} aria-hidden="true" />
					<a href="/trip/{inView.id}" class="underline-offset-4 hover:underline"
						>See this day on the map</a
					>
				</p>
			{/if}
		</div>

		{#if customizing}
			<Customizer
				{tab}
				ontab={setTab}
				page={targetTrip && target !== null
					? { index: target, title: targetTrip.storyTitle ?? targetTrip.title ?? 'A day out' }
					: null}
				choices={daysInView.length > 1
					? daysInView.map((index, i) => ({ index, side: i === 0 ? 'Left' : 'Right' }))
					: []}
				onchoose={(i) => (picked = i)}
				style={targetTrip ? styleOf(targetTrip.id) : null}
				custom={!!targetTrip && targetTrip.id in own}
				onpage={editPage}
				onreset={resetPage}
				onapplyall={applyToAll}
				pageCount={trips.length}
				ongoto={trips.length ? () => book?.jump(2) : null}
				{cover}
				oncover={editCover}
				onresetcover={resetCover}
				status={saveState}
				onclose={closeCustomizer}
			/>
		{/if}
	</div>
</div>

{#if sharing}
	{@const style = styleOf(sharing.id)}
	{#key `${sharing.id}:${JSON.stringify(style)}`}<ShareDialog
			trip={sharing}
			{style}
			bind:open={shareOpen}
		/>{/key}
{/if}
