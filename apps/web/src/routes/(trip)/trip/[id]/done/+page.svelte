<script lang="ts">
	/**
	 * End of the day, two short steps. 1: a note (typed or spoken), up to four photos, the highlight stop.
	 * 2: AI drafts a title and story and suggests six "best for" tags; keep up to three, tweak, save to scrapbook.
	 * It may also suggest a phrase or two the note reveals about their taste ("Explorin can remember"), kept only if tapped.
	 */
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import Mic from '@lucide/svelte/icons/mic';
	import MicOff from '@lucide/svelte/icons/mic-off';
	import Check from '@lucide/svelte/icons/check';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import PhotoPicker from '#lib/components/PhotoPicker.svelte';
	import { api, uploadPhotos } from '#lib/client';
	import { BEST_FOR_MAX, type KeepsakeDraft } from '#lib/keepsake';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const trip = $derived(data.trip);
	const candidates = $derived([
		...trip.stops.filter((s) => s.visitedAt),
		...trip.stops.filter((s) => !s.visitedAt && s.inPlan)
	]);

	let step = $state<1 | 2>(1);
	let note = $state('');
	let files = $state<File[]>([]);
	// svelte-ignore state_referenced_locally
	let highlight = $state<string | null>(candidates[0]?.id ?? null);
	let busy = $state('');
	let err = $state('');
	let draft = $state<KeepsakeDraft | null>(null);
	let photoUrls = $state<string[]>([]);
	let picked = $state<string[]>([]);
	let title = $state('');
	let story = $state('');
	let share = $state(true);
	let learned = $state<string[]>([]);

	type Recognition = {
		lang: string;
		interimResults: boolean;
		continuous: boolean;
		onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
		onend: (() => void) | null;
		onerror: (() => void) | null;
		start(): void;
		stop(): void;
	};
	let recognition: Recognition | undefined;
	let listening = $state(false);
	let canSpeak = $state(false);
	onMount(() => {
		const w = window as unknown as {
			SpeechRecognition?: new () => Recognition;
			webkitSpeechRecognition?: new () => Recognition;
		};
		const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
		if (!Ctor) return;
		canSpeak = true;
		recognition = new Ctor();
		recognition.lang = navigator.language || 'en-US';
		recognition.interimResults = false;
		recognition.continuous = true;
		recognition.onresult = (e) => {
			const last = e.results[e.results.length - 1];
			note = `${note} ${last[0].transcript}`.trim().slice(0, 1200);
		};
		recognition.onend = () => (listening = false);
		recognition.onerror = () => {
			listening = false;
			err = 'Voice input stopped. You can keep typing.';
		};
		return () => recognition?.stop();
	});
	function toggleVoice() {
		err = '';
		if (listening) recognition?.stop();
		else {
			try {
				recognition?.start();
				listening = true;
			} catch {
				err = 'Voice input is unavailable here.';
			}
		}
	}

	async function toDraft() {
		recognition?.stop();
		err = '';
		try {
			if (files.length) {
				busy = 'Uploading photos';
				photoUrls = await uploadPhotos(files);
			}
			busy = 'Writing your page';
			draft = await api<KeepsakeDraft>(`/api/trip/${trip.id}/draft`, {
				method: 'POST',
				json: { note: note.trim() },
				timeoutMs: 30000
			});
			title = draft.title;
			story = draft.story;
			picked = [];
			learned = [];
			step = 2;
			window.scrollTo({ top: 0 });
		} catch (e) {
			err = e instanceof Error ? e.message : 'Something went wrong. Please try again.';
		} finally {
			busy = '';
		}
	}

	/** Grow a text box with what is in it, so the title and story are never cut off. */
	function autosize(el: HTMLTextAreaElement) {
		const fit = () => {
			el.style.height = 'auto';
			el.style.height = `${el.scrollHeight}px`;
		};
		fit();
		el.addEventListener('input', fit);
		return { destroy: () => el.removeEventListener('input', fit) };
	}

	function pick(b: string) {
		picked = picked.includes(b)
			? picked.filter((x) => x !== b)
			: picked.length < BEST_FOR_MAX
				? [...picked, b]
				: picked;
	}

	async function save() {
		if (!draft) return;
		busy = 'Saving to your scrapbook';
		err = '';
		try {
			await api(`/api/trip/${trip.id}/finish`, {
				method: 'POST',
				json: {
					note: note.trim(),
					photoUrls,
					highlightStopId: highlight,
					bestFor: picked,
					bestForOptions: draft.bestForOptions,
					title: title.trim() || draft.title,
					story: story.trim(),
					emotions: draft.emotions,
					quote: draft.quote,
					share,
					learned
				}
			});
			await goto(`/scrapbook/${trip.id}?new=1`);
		} catch (e) {
			err = e instanceof Error ? e.message : 'Could not save. Please try again.';
			busy = '';
		}
	}
</script>

<svelte:head><title>Explorin · How was it?</title></svelte:head>

<div class="mx-auto min-h-dvh max-w-xl px-5 pt-5 pb-36">
	<a href="/trip/{trip.id}" class="inline-flex items-center gap-1.5 text-sm text-ink/60"
		><ArrowLeft size={16} aria-hidden="true" />Back to the map</a
	>

	{#if step === 1}
		<div in:fade>
			<p class="mt-6 text-sm font-medium text-orange">{trip.title}</p>
			<h1 class="mt-1 font-serif text-4xl leading-tight font-semibold">How was it?</h1>
			<p class="mt-2 text-ink/70">A few honest lines. It becomes your scrapbook page.</p>

			<div class="relative mt-6">
				<label for="note" class="sr-only">Your note</label>
				<textarea
					id="note"
					bind:value={note}
					maxlength="1200"
					rows="5"
					placeholder="The bakery line was worth it. Got a little lost by the river and didn’t mind at all…"
					class="w-full resize-none rounded-2xl border border-ink/15 bg-white p-4 pb-12 font-hand text-2xl leading-snug outline-none focus:border-green"
				></textarea>
				{#if canSpeak}
					<button
						type="button"
						onclick={toggleVoice}
						aria-pressed={listening}
						class="absolute right-3 bottom-3 flex h-9 items-center gap-1.5 rounded-full px-3 text-sm {listening
							? 'bg-orange text-white'
							: 'bg-moss text-ink'}"
						>{#if listening}<MicOff size={15} aria-hidden="true" />Stop{:else}<Mic
								size={15}
								aria-hidden="true"
							/>Speak{/if}</button
					>
				{/if}
			</div>

			<h2 class="mt-8 text-sm font-medium">
				A few photos <span class="font-normal text-ink/50">(up to 4, optional)</span>
			</h2>
			<p class="mb-2 text-xs text-ink/50">Location data is removed on your phone before upload.</p>
			<PhotoPicker bind:files max={4} />

			{#if candidates.length}
				<h2 class="mt-8 text-sm font-medium">The highlight</h2>
				<div class="mt-2 flex flex-wrap gap-2">
					{#each candidates as s (s.id)}
						<button
							type="button"
							onclick={() => (highlight = s.id)}
							aria-pressed={highlight === s.id}
							class="rounded-full px-3.5 py-2 text-sm ring-1 {highlight === s.id
								? 'bg-ink text-cream ring-ink'
								: 'bg-paper ring-ink/15'}">{s.place}</button
						>
					{/each}
				</div>
			{/if}
		</div>
	{:else if draft}
		<div in:fly={{ x: 30 }}>
			<p class="mt-6 flex items-center gap-1.5 text-sm font-medium text-orange">
				<Sparkles size={15} aria-hidden="true" />{draft.aiGenerated
					? 'Drafted from your note'
					: 'From your note'}
			</p>
			<h1 class="mt-1 font-serif text-4xl leading-tight font-semibold">Who’s this day best for?</h1>
			<p class="mt-2 text-ink/70">
				Pick up to {BEST_FOR_MAX}, or none. They become stickers on your page.
			</p>
			<div class="mt-4 flex flex-wrap gap-2" role="group" aria-label="Best for">
				{#each draft.bestForOptions as b (b)}
					{@const on = picked.includes(b)}
					<button
						type="button"
						onclick={() => pick(b)}
						aria-pressed={on}
						disabled={!on && picked.length >= BEST_FOR_MAX}
						class="flex items-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-medium ring-1 transition disabled:opacity-40 {on
							? 'bg-orange text-white ring-orange'
							: 'bg-paper text-ink ring-ink/15'}"
						>{#if on}<Check size={14} aria-hidden="true" />{/if}{b}</button
					>
				{/each}
			</div>
			<p class="mt-2 text-xs text-ink/50">{picked.length} of {BEST_FOR_MAX} picked</p>

			<div class="mt-8 rounded-3xl bg-paper p-5 ring-1 ring-ink/10">
				<label for="title" class="text-xs font-semibold tracking-wide text-ink/55 uppercase"
					>Page title</label
				>
				<textarea
					id="title"
					bind:value={title}
					use:autosize
					maxlength="80"
					rows="1"
					onkeydown={(e) => e.key === 'Enter' && e.preventDefault()}
					class="mt-1 w-full resize-none border-b border-ink/15 bg-transparent pb-1 font-serif text-2xl leading-tight font-semibold outline-none focus:border-green"
				></textarea>
				<label
					for="story"
					class="mt-5 block text-xs font-semibold tracking-wide text-ink/55 uppercase"
					>The story</label
				>
				<textarea
					id="story"
					bind:value={story}
					use:autosize
					maxlength="900"
					rows="3"
					class="mt-1 w-full resize-none bg-transparent text-ink/85 outline-none"></textarea>
				<p class="text-xs text-ink/45">This goes on your page, in your handwriting.</p>
				{#if draft.emotions.length}
					<div class="mt-3 flex flex-wrap gap-1.5">
						{#each draft.emotions as e (e)}<span class="rounded-full bg-moss px-2.5 py-1 text-xs"
								>{e}</span
							>{/each}
					</div>
				{/if}
			</div>

			{#if draft.quote}
				<label class="mt-6 flex items-start gap-3 rounded-2xl bg-white p-4 ring-1 ring-ink/10">
					<input type="checkbox" bind:checked={share} class="mt-1 h-5 w-5 accent-[#285c47]" />
					<span class="text-sm">
						<span class="font-medium">Help people like you</span>
						<span class="mt-0.5 block text-ink/60"
							>Share one line, with your first name: <em>“{draft.quote}”</em></span
						>
					</span>
				</label>
			{/if}

			{#if draft.learned.length}
				<section
					class="mt-6 rounded-2xl bg-white p-4 ring-1 ring-ink/10"
					aria-labelledby="learned-heading"
				>
					<h2 id="learned-heading" class="text-sm font-medium">Explorin can remember</h2>
					<p class="mt-0.5 text-sm text-ink/60">
						From your note, for your next plans. Tap the ones that sound like you; nothing is kept
						unless you pick it, and Settings can forget it later.
					</p>
					<div class="mt-3 flex flex-wrap gap-2" role="group" aria-label="Phrases to remember">
						{#each draft.learned as phrase (phrase)}
							{@const on = learned.includes(phrase)}
							<button
								type="button"
								onclick={() =>
									(learned = on ? learned.filter((p) => p !== phrase) : [...learned, phrase])}
								aria-pressed={on}
								class="flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm ring-1 transition {on
									? 'bg-moss text-ink ring-green'
									: 'bg-paper text-ink/80 ring-ink/15'}"
								>{#if on}<Check size={14} aria-hidden="true" />{/if}{phrase}</button
							>
						{/each}
					</div>
				</section>
			{/if}
		</div>
	{/if}
	{#if err}<p class="mt-4 text-sm text-red-700" role="alert">{err}</p>{/if}
</div>

<div
	class="fixed inset-x-0 bottom-0 z-20 border-t border-ink/10 bg-paper/95 backdrop-blur"
	style="padding-bottom: env(safe-area-inset-bottom)"
>
	<div class="mx-auto flex max-w-xl gap-3 p-4">
		{#if step === 2}<button
				type="button"
				onclick={() => (step = 1)}
				disabled={!!busy}
				class="px-2 text-sm text-ink/60">← Note</button
			>{/if}
		<button
			type="button"
			disabled={!!busy || (step === 1 && note.trim().length < 3 && !files.length)}
			onclick={step === 1 ? toDraft : save}
			class="h-14 flex-1 rounded-full bg-ink text-lg font-semibold text-cream active:scale-[0.98] disabled:opacity-40"
		>
			{busy ? `${busy}…` : step === 1 ? 'Next' : 'Save to my scrapbook'}
		</button>
	</div>
</div>
