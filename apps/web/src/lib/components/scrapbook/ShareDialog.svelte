<script lang="ts">
	/**
	 * Share a page as an image: Story (9:16, for Instagram stories), Post (4:5) or the book Page (3:4). The PNG is
	 * rendered as soon as the dialog opens or the format changes, so the Share tap can call the native share sheet
	 * straight away (iOS refuses it after slow work between the tap and the call). On iPhone the sheet offers
	 * Instagram, Save Image (Photos) and Save to Files; elsewhere the PNG can be downloaded.
	 */
	import { tick } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import X from '@lucide/svelte/icons/x';
	import Share from '@lucide/svelte/icons/share';
	import Download from '@lucide/svelte/icons/download';
	import type { Trip } from '#lib/adventure';
	import { layoutPage, type Format } from '#lib/scrapbook/layout';
	import { renderPng } from '#lib/scrapbook/export';
	import Page from './Page.svelte';

	let { trip, open = $bindable(false) }: { trip: Trip; open?: boolean } = $props();

	const FORMATS: { id: Format; label: string; hint: string }[] = [
		{ id: 'story', label: 'Story', hint: '9:16' },
		{ id: 'post', label: 'Post', hint: '4:5' },
		{ id: 'page', label: 'Page', hint: '3:4' }
	];
	let format = $state<Format>('story');
	let files = $state<Partial<Record<Format, File>>>({});
	let preview = $state('');
	let busy = $state(false);
	let err = $state('');
	let status = $state('');
	let base = $state<SVGSVGElement>();
	let overlay = $state<SVGSVGElement>();
	let host = $state<HTMLElement>();
	let canShare = $state(false);

	const name = $derived(
		`explorin-${(trip.storyTitle ?? trip.title ?? 'day')
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '')}-${format}.png`
	);

	async function render(f: Format) {
		if (files[f]) return;
		busy = true;
		err = '';
		try {
			await tick();
			base = host?.querySelector<SVGSVGElement>('svg[data-part="base"]') ?? undefined;
			overlay = host?.querySelector<SVGSVGElement>('svg[data-part="overlay"]') ?? undefined;
			if (!base || !overlay) throw new Error('Page not ready');
			const blob = await renderPng(base, overlay, layoutPage(trip, f));
			files = { ...files, [f]: new File([blob], name, { type: 'image/png' }) };
		} catch (e) {
			err = e instanceof Error ? e.message : 'Could not create the image.';
		} finally {
			busy = false;
		}
	}

	$effect(() => {
		if (!open) return;
		const f = format;
		render(f);
	});
	// "Image saved." belongs to the image it was said about.
	$effect(() => {
		void format;
		if (open) status = '';
	});
	$effect(() => {
		const file = files[format];
		if (!file) return;
		const url = URL.createObjectURL(file);
		preview = url;
		canShare = typeof navigator !== 'undefined' && !!navigator.canShare?.({ files: [file] });
		return () => URL.revokeObjectURL(url);
	});

	async function share() {
		const file = files[format];
		if (!file) return;
		status = '';
		try {
			await navigator.share({
				files: [file],
				title: trip.storyTitle ?? trip.title ?? 'My day',
				text: 'Made with Explorin'
			});
			status = 'Shared.';
		} catch (e) {
			if (!(e instanceof DOMException && e.name === 'AbortError'))
				err = 'Sharing didn’t work here. Save the image instead.';
		}
	}
	function save() {
		const file = files[format];
		if (!file) return;
		const a = document.createElement('a');
		a.href = preview;
		a.download = file.name;
		a.click();
		status = 'Image saved.';
	}
	const close = () => (open = false);
</script>

{#if open}
	<div
		class="fixed inset-0 z-50 flex items-end justify-center bg-ink/60 p-0 sm:items-center sm:p-6"
		transition:fade={{ duration: 150 }}
		role="presentation"
		onclick={close}
	>
		<div
			class="max-h-[94dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-paper p-5 sm:rounded-3xl"
			role="dialog"
			aria-modal="true"
			aria-labelledby="share-heading"
			tabindex="-1"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.key === 'Escape' && close()}
			transition:fly={{ y: 40, duration: 200 }}
			style="padding-bottom: max(1.25rem, env(safe-area-inset-bottom))"
		>
			<div class="flex items-center justify-between">
				<h2 id="share-heading" class="font-serif text-2xl font-semibold">Share this day</h2>
				<button
					type="button"
					onclick={close}
					aria-label="Close"
					class="flex h-9 w-9 items-center justify-center rounded-full bg-moss"
					><X size={17} aria-hidden="true" /></button
				>
			</div>
			<div
				class="mt-4 grid grid-cols-3 gap-1 rounded-full bg-moss p-1"
				role="radiogroup"
				aria-label="Format"
			>
				{#each FORMATS as f (f.id)}
					<button
						type="button"
						role="radio"
						aria-checked={format === f.id}
						onclick={() => (format = f.id)}
						class="rounded-full py-2 text-sm font-medium {format === f.id
							? 'bg-ink text-cream'
							: 'text-ink/70'}">{f.label} <span class="text-xs opacity-60">{f.hint}</span></button
					>
				{/each}
			</div>
			<div class="mt-4 flex justify-center">
				<div
					class="relative flex items-center justify-center overflow-hidden rounded-2xl bg-cream ring-1 ring-ink/10"
					style="height: min(52dvh, 460px); aspect-ratio: {format === 'story'
						? '9 / 16'
						: format === 'post'
							? '4 / 5'
							: '3 / 4'}"
				>
					{#if files[format]}
						<img
							src={preview}
							alt="Your page as it will be shared"
							class="h-full w-full object-contain"
						/>
					{:else}
						<p class="text-sm text-ink/55">{busy ? 'Making your image…' : err || ' '}</p>
					{/if}
				</div>
			</div>
			<div class="mt-5 grid gap-2">
				{#if canShare}
					<button
						type="button"
						onclick={share}
						disabled={!files[format]}
						class="flex items-center justify-center gap-2 rounded-full bg-orange py-3.5 font-semibold text-white disabled:opacity-50"
						><Share size={18} aria-hidden="true" />Share…</button
					>
				{/if}
				<button
					type="button"
					onclick={save}
					disabled={!files[format]}
					class="flex items-center justify-center gap-2 rounded-full py-3.5 font-semibold disabled:opacity-50 {canShare
						? 'ring-1 ring-ink/20'
						: 'bg-ink text-cream'}"
					><Download size={18} aria-hidden="true" />{canShare
						? 'Save to Files'
						: 'Download image'}</button
				>
			</div>
			{#if canShare}<p class="mt-3 text-center text-xs text-ink/55">
					In the share menu: <strong>Instagram</strong> to post it, <strong>Save Image</strong> for Photos.
				</p>{/if}
			{#if status}<p class="mt-2 text-center text-sm text-green" role="status">{status}</p>{/if}
			{#if err && files[format]}<p class="mt-2 text-center text-sm text-red-700" role="alert">
					{err}
				</p>{/if}
		</div>
	</div>
	<!-- Offscreen copies the exporter rasterises. -->
	<div
		bind:this={host}
		aria-hidden="true"
		style="position:fixed; left:-20000px; top:0; width:10px; height:10px; overflow:hidden"
	>
		{#key format}
			<div><Page {trip} {format} part="base" /></div>
			<div><Page {trip} {format} part="overlay" /></div>
		{/key}
	</div>
{/if}
