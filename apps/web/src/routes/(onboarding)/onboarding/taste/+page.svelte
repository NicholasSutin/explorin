<script lang="ts">
	/**
	 * Onboarding 2 of 2: grade a short, personalised set of cards from S+ to NO, one at a time. Grades save as you
	 * go; the board below is the tier list itself, and tapping a thumbnail brings that card back. "Grade more"
	 * pulls the next most useful cards; finishing marks the account onboarded.
	 */
	import { goto, invalidateAll } from '$app/navigation';
	import { fly, fade } from 'svelte/transition';
	import { onMount } from 'svelte';
	import { api } from '#lib/client';
	import { CATEGORY, GRADES, categoryImage, type Grade, type Grades } from '#lib/taste';
	import TierBoard from '#lib/components/TierBoard.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	/** Whether this is a re-grade from Settings, fixed at arrival (finishing onboarding flips it on reload). */
	// svelte-ignore state_referenced_locally
	const redo = data.redo;
	// svelte-ignore state_referenced_locally
	let ids = $state<string[]>(data.ids);
	// svelte-ignore state_referenced_locally
	let grades = $state<Grades>({ ...data.grades });
	/** The card on screen: the first ungraded one, or one picked from the board to re-grade. */
	let focus = $state<string | null>(null);
	let busy = $state(false);
	let err = $state('');
	let direction = $state(1);

	const ungraded = $derived(ids.filter((id) => !grades[id]));
	const current = $derived(focus ?? ungraded[0] ?? null);
	const graded = $derived(Object.keys(grades).filter((id) => grades[id]).length);
	const MIN = 5;

	const LABEL: Record<Grade, string> = {
		'S+': 'Obsessed',
		'A+': 'Love it',
		A: 'Like it',
		B: 'It’s fine',
		C: 'Meh',
		NO: 'Skip it'
	};
	const BUTTON: Record<Grade, string> = {
		'S+': 'bg-orange text-white',
		'A+': 'bg-green text-cream',
		A: 'bg-[#5f8a6e] text-cream',
		B: 'bg-[#a9bf9c] text-ink',
		C: 'bg-[#d8d3c2] text-ink',
		NO: 'bg-ink text-cream'
	};

	let pending: Record<string, Grade | null> = {};
	let timer: ReturnType<typeof setTimeout> | undefined;
	function save(now = false) {
		clearTimeout(timer);
		const send = async () => {
			const batch = pending;
			pending = {};
			if (!Object.keys(batch).length) return;
			try {
				await api('/api/taste', { method: 'POST', json: { grades: batch, offered: ids } });
			} catch (e) {
				pending = { ...batch, ...pending };
				err = e instanceof Error ? e.message : 'Could not save that grade.';
			}
		};
		if (now) return send();
		timer = setTimeout(send, 600);
	}

	function grade(g: Grade) {
		// Read once: `current` moves on to the next ungraded card as soon as `grades` changes.
		const id = current;
		if (!id) return;
		direction = g === 'NO' || g === 'C' ? -1 : 1;
		grades = { ...grades, [id]: g };
		pending[id] = g;
		focus = null;
		err = '';
		save();
	}
	function skip() {
		if (!current) return;
		direction = 1;
		// Move it to the end of the queue without grading it.
		ids = [...ids.filter((id) => id !== current), current];
		focus = null;
	}

	async function more() {
		busy = true;
		err = '';
		try {
			await save(true);
			const res = await api<{ ids: string[] }>('/api/taste?count=6');
			const fresh = res.ids.filter((id) => !ids.includes(id));
			if (!fresh.length) err = 'That’s every card. Nice.';
			ids = [...ids, ...fresh];
			await api('/api/taste', { method: 'POST', json: { grades: {}, offered: ids } });
		} catch (e) {
			err = e instanceof Error ? e.message : 'Could not load more cards.';
		} finally {
			busy = false;
		}
	}

	async function finish() {
		busy = true;
		err = '';
		try {
			clearTimeout(timer);
			await api('/api/taste', {
				method: 'POST',
				json: { grades: { ...pending }, offered: ids, finish: true }
			});
			pending = {};
			await invalidateAll();
			goto(redo ? '/settings?saved=taste' : '/');
		} catch (e) {
			err = e instanceof Error ? e.message : 'Could not save your taste.';
			busy = false;
		}
	}

	onMount(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
			const i = Number(e.key);
			if (i >= 1 && i <= 6) grade(GRADES[i - 1]);
			else if (e.key === 's' || e.key === 'ArrowRight') skip();
		};
		window.addEventListener('keydown', onKey);
		return () => {
			window.removeEventListener('keydown', onKey);
			if (Object.keys(pending).length) save(true);
		};
	});
</script>

<svelte:head><title>Explorin · Your taste</title></svelte:head>

<div class="grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] md:items-start">
	<section>
		<p class="text-sm font-medium text-orange">{redo ? 'Re-grade anything' : 'Step 2 of 2'}</p>
		<h1 class="mt-1 font-serif text-3xl leading-tight font-semibold sm:text-4xl">
			Grade what you love.
		</h1>
		<p class="mt-2 text-sm text-ink/70 sm:text-base">
			A short, personal set based on what you told us. Be honest: <strong>NO</strong> is as useful
			as
			<strong>S+</strong>.
		</p>

		<div class="relative mt-4 h-[min(44dvh,420px)] sm:mt-6 md:h-[min(60vh,520px)]">
			{#key current}
				{#if current}
					{@const c = CATEGORY.get(current)}
					<article
						class="absolute inset-0 flex flex-col overflow-hidden rounded-3xl bg-ink shadow-[0_20px_40px_-20px_rgba(32,61,50,0.6)]"
						in:fly={{ x: 60 * direction, duration: 260 }}
						out:fly={{ x: -80 * direction, duration: 200, opacity: 0 }}
						aria-live="polite"
					>
						<img
							src={categoryImage(current)}
							alt=""
							class="absolute inset-0 h-full w-full object-cover"
							onerror={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')}
						/>
						<div
							class="absolute inset-0 bg-gradient-to-t from-ink/90 via-ink/10 to-transparent"
						></div>
						<div class="relative mt-auto p-5 text-cream">
							<p class="text-xs tracking-[0.18em] text-cream/70 uppercase">
								{ungraded.length && !focus
									? `${ids.length - ungraded.length + 1} of ${ids.length}`
									: 'Change grade'}
							</p>
							<h2 class="font-serif text-3xl font-semibold">{c?.name}</h2>
							{#if grades[current]}<p class="mt-1 text-sm text-cream/80">
									Now: {grades[current]}
								</p>{/if}
						</div>
					</article>
				{:else}
					<div
						class="absolute inset-0 flex flex-col items-center justify-center rounded-3xl bg-paper p-8 text-center ring-1 ring-ink/10"
						in:fade
					>
						<img src="/brand/mark-orange.svg" alt="" class="h-14 w-14" />
						<h2 class="mt-4 font-serif text-2xl font-semibold">That’s a taste profile.</h2>
						<p class="mt-2 max-w-xs text-ink/70">
							{graded} graded. Grade a few more for sharper plans, or start planning now.
						</p>
						<button
							type="button"
							onclick={more}
							disabled={busy}
							class="mt-5 rounded-full px-5 py-2.5 text-sm font-medium ring-1 ring-ink/25 hover:bg-moss disabled:opacity-50"
							>{busy ? 'Finding more…' : 'Grade 6 more'}</button
						>
					</div>
				{/if}
			{/key}
		</div>

		{#if current}
			<div
				class="mt-4 grid grid-cols-6 gap-1.5"
				role="group"
				aria-label="Grade {CATEGORY.get(current)?.name}"
			>
				{#each GRADES as g, i (g)}
					<button
						type="button"
						onclick={() => grade(g)}
						aria-label="{g}, {LABEL[g]}"
						aria-keyshortcuts={String(i + 1)}
						class="flex flex-col items-center rounded-2xl py-2.5 font-serif font-bold active:scale-95 {BUTTON[
							g
						]} {grades[current] === g ? 'ring-4 ring-orange/40' : ''}"
					>
						<span class="text-xl">{g}</span>
						<span class="font-sans text-[10px] font-medium opacity-85">{LABEL[g]}</span>
					</button>
				{/each}
			</div>
			<div class="mt-2 flex justify-between text-sm text-ink/60">
				<button type="button" onclick={skip} class="underline-offset-4 hover:underline"
					>Not sure, skip</button
				>
				<span class="hidden sm:inline">Keys 1–6 grade, S skips</span>
			</div>
		{/if}
	</section>

	<aside class="md:sticky md:top-6">
		<h2 class="mb-2 text-xs font-semibold tracking-[0.18em] text-ink/60 uppercase">
			Your tier list
		</h2>
		<TierBoard {grades} onpick={(id) => (focus = id)} />
		<p class="mt-2 text-xs text-ink/50">Tap a card to change its grade.</p>
	</aside>
</div>

<div
	class="fixed inset-x-0 bottom-0 z-20 border-t border-ink/10 bg-paper/95 backdrop-blur"
	style="padding-bottom: env(safe-area-inset-bottom)"
>
	<div class="mx-auto flex max-w-2xl items-center gap-3 p-4">
		{#if !redo}<a href="/onboarding?back" class="px-2 text-sm text-ink/60">← Back</a>{/if}
		<button
			type="button"
			onclick={finish}
			disabled={busy || graded < MIN}
			class="h-14 flex-1 rounded-full bg-ink text-lg font-semibold text-cream active:scale-[0.98] disabled:opacity-40"
		>
			{graded < MIN
				? `Grade ${MIN - graded} more to continue`
				: busy
					? 'Saving…'
					: redo
						? 'Save my taste'
						: 'Start planning →'}
		</button>
	</div>
	{#if err}<p class="pb-3 text-center text-sm text-red-700" role="alert">{err}</p>{/if}
</div>
