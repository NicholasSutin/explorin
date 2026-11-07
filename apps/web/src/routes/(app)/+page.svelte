<script lang="ts">
	/** Home: say what today should feel like, watch the plan come together, land on the trip map. */
	import { goto } from '$app/navigation';
	import { tick } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import LocateFixed from '@lucide/svelte/icons/locate-fixed';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import { DAY_WINDOWS, type DayWindow, type DiscoveryStep } from '#lib/adventure';
	import { getLocation, streamApi } from '#lib/client';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let prompt = $state('');
	// svelte-ignore state_referenced_locally
	let city = $state(data.homeCity);
	let when = $state<DayWindow>(defaultWindow());
	let nearMe = $state(true);
	let busy = $state(false);
	let error = $state('');
	let steps = $state<DiscoveryStep[]>([]);
	let elapsed = $state(0);
	let panel = $state<HTMLElement>();

	function defaultWindow(): DayWindow {
		const h = new Date().getHours();
		return h < 11 ? 'morning' : h < 16 ? 'afternoon' : h < 22 ? 'evening' : 'now';
	}
	const greeting = (() => {
		const h = new Date().getHours();
		return h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
	})();

	async function plan(text = prompt) {
		if (text.trim().length < 3 || busy) return;
		prompt = text;
		busy = true;
		error = '';
		steps = [];
		const started = Date.now();
		const clock = setInterval(() => (elapsed = Date.now() - started), 100);
		await tick();
		panel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
		try {
			let origin: Awaited<ReturnType<typeof getLocation>> = null;
			if (nearMe) {
				steps = [{ id: 'locate', label: 'Finding where you are', state: 'running' }];
				const t0 = Date.now();
				origin = await getLocation(4000);
				steps = [
					{
						id: 'locate',
						label: 'Finding where you are',
						state: origin ? 'done' : 'skipped',
						detail: origin
							? 'Starting the route near you'
							: 'Location unavailable; planning from the city',
						ms: Date.now() - t0
					}
				];
			}
			let tripId = '';
			await streamApi(
				'/api/plan',
				{ prompt: text.trim(), city: city.trim(), window: when, origin: origin ?? undefined },
				(e) => {
					if (e.type === 'step') {
						const s = e.step as DiscoveryStep;
						steps = steps.some((x) => x.id === s.id)
							? steps.map((x) => (x.id === s.id ? s : x))
							: [...steps, s];
					} else if (e.type === 'result') tripId = String(e.tripId);
					else if (e.type === 'error') throw new Error(String(e.error));
				}
			);
			if (!tripId) throw new Error('Planning stopped early. Please try again.');
			await goto(`/trip/${tripId}`);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Planning failed. Please try again.';
			busy = false;
		} finally {
			clearInterval(clock);
		}
	}

	const status = (t: { status: string; visited: number; stops: number }) =>
		t.status === 'finished'
			? 'In your scrapbook'
			: t.visited
				? `${t.visited} of ${t.stops} stops`
				: `${t.stops} stops planned`;
</script>

<svelte:head><title>Explorin · Plan your day</title></svelte:head>

<div class="mx-auto max-w-2xl pt-2">
	<p class="text-sm text-ink/60">{greeting}{data.name ? `, ${data.name}` : ''}.</p>
	<h1 class="mt-1 font-serif text-4xl leading-tight font-semibold sm:text-5xl">
		What’s the plan today?
	</h1>

	{#if data.current && !busy}
		<a
			href="/trip/{data.current.id}"
			class="mt-6 flex items-center gap-4 rounded-2xl bg-ink p-4 text-cream shadow-lg"
			in:fly={{ y: 8 }}
		>
			<span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-orange"
				><MapPin size={20} aria-hidden="true" /></span
			>
			<span class="min-w-0 flex-1">
				<span class="block text-xs tracking-wide text-cream/70 uppercase">Continue your day</span>
				<span class="block truncate font-serif text-lg">{data.current.title}</span>
				<span class="block text-xs text-cream/70">{status(data.current)}</span>
			</span>
			<ArrowRight size={20} aria-hidden="true" />
		</a>
	{/if}

	<form
		class="mt-6 rounded-3xl bg-paper p-4 ring-1 ring-ink/10 sm:p-6"
		onsubmit={(e) => {
			e.preventDefault();
			plan();
		}}
	>
		<label for="prompt" class="sr-only">Describe your day</label>
		<textarea
			id="prompt"
			bind:value={prompt}
			required
			minlength="3"
			maxlength="600"
			rows="3"
			disabled={busy}
			placeholder="A slow afternoon with a little art, a great pastry and somewhere to sit by the water…"
			class="w-full resize-none rounded-2xl border border-ink/15 bg-white p-4 text-base outline-none focus:border-green"
		></textarea>
		<div class="mt-2 flex flex-wrap gap-2">
			{#each data.starters as s (s)}
				<button
					type="button"
					disabled={busy}
					onclick={() => plan(s)}
					class="rounded-full bg-moss px-3 py-1.5 text-left text-sm text-ink/85 hover:bg-moss/60 disabled:opacity-50"
					>{s} ↗</button
				>
			{/each}
		</div>

		<div class="mt-5 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
			<label class="block">
				<span class="text-xs font-semibold tracking-wide text-ink/60 uppercase">Exploring in</span>
				<input
					bind:value={city}
					required
					minlength="2"
					maxlength="80"
					disabled={busy}
					class="mt-1 h-11 w-full rounded-xl border border-ink/15 bg-white px-3 text-base outline-none focus:border-green"
				/>
			</label>
			<label class="flex h-11 items-center gap-2 text-sm text-ink/75">
				<input
					type="checkbox"
					bind:checked={nearMe}
					disabled={busy}
					class="h-4 w-4 accent-[#285c47]"
				/>
				<LocateFixed size={16} aria-hidden="true" /> Start near me
			</label>
		</div>
		<fieldset class="mt-4">
			<legend class="text-xs font-semibold tracking-wide text-ink/60 uppercase">When</legend>
			<div class="mt-1.5 flex flex-wrap gap-1.5">
				{#each DAY_WINDOWS as w (w.id)}
					<label
						class="cursor-pointer rounded-full px-3 py-1.5 text-sm ring-1 select-none {when === w.id
							? 'bg-ink text-cream ring-ink'
							: 'bg-white text-ink/75 ring-ink/15'}"
					>
						<input
							type="radio"
							name="window"
							value={w.id}
							bind:group={when}
							class="sr-only"
							disabled={busy}
						/>{w.label}
					</label>
				{/each}
			</div>
		</fieldset>

		<button
			disabled={busy || prompt.trim().length < 3}
			class="mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-full bg-orange text-lg font-semibold text-white active:scale-[0.98] disabled:opacity-45"
		>
			{busy ? 'Planning your day…' : 'Plan my day'}<ArrowRight size={20} aria-hidden="true" />
		</button>
		{#if error}<p class="mt-3 text-sm text-red-700" role="alert">{error}</p>{/if}
	</form>

	{#if busy || steps.length}
		<section
			bind:this={panel}
			class="mt-6 rounded-3xl bg-ink p-5 text-cream"
			aria-live="polite"
			in:fade
		>
			<div
				class="flex items-center justify-between text-xs tracking-[0.18em] text-cream/60 uppercase"
			>
				<span>Building your day</span><span class="font-mono tracking-normal"
					>{(elapsed / 1000).toFixed(1)} s</span
				>
			</div>
			<ol class="mt-4 space-y-3">
				{#each steps as s (s.id)}
					<li class="flex gap-3" in:fly={{ y: 6 }}>
						<span
							class="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full {s.state === 'done'
								? 'bg-[#9cc39f]'
								: s.state === 'running'
									? 'animate-pulse bg-orange'
									: s.state === 'failed'
										? 'bg-red-400'
										: 'bg-cream/30'}"
						></span>
						<div class="min-w-0 flex-1">
							<p class="font-medium">{s.label}</p>
							{#if s.detail}<p class="text-sm text-cream/70">{s.detail}</p>{/if}
							{#if s.items?.length}<p class="mt-0.5 truncate text-xs text-cream/50">
									{s.items.join(' · ')}
								</p>{/if}
						</div>
						{#if s.ms}<span class="font-mono text-xs text-cream/50"
								>{(s.ms / 1000).toFixed(1)}s</span
							>{/if}
					</li>
				{/each}
				{#if busy && !steps.length}<li class="flex gap-3">
						<span class="mt-1.5 h-2.5 w-2.5 animate-pulse rounded-full bg-orange"></span>Getting
						started
					</li>{/if}
			</ol>
		</section>
	{/if}

	{#if data.recent.length && !busy}
		<section class="mt-10">
			<h2 class="text-xs font-semibold tracking-[0.18em] text-ink/60 uppercase">Recent days</h2>
			<ul class="mt-3 divide-y divide-ink/10 rounded-2xl bg-paper ring-1 ring-ink/10">
				{#each data.recent as t (t.id)}
					<li>
						<a
							href={t.status === 'finished' ? `/scrapbook/${t.id}` : `/trip/${t.id}`}
							class="flex items-center gap-3 p-4 hover:bg-moss/40"
						>
							{#if t.cover}<img
									src={t.cover}
									alt=""
									class="h-12 w-12 rounded-lg object-cover"
								/>{:else}<span
									class="flex h-12 w-12 items-center justify-center rounded-lg bg-moss text-green"
									><MapPin size={18} aria-hidden="true" /></span
								>{/if}
							<span class="min-w-0 flex-1">
								<span class="block truncate font-serif text-lg">{t.storyTitle ?? t.title}</span>
								<span class="block text-xs text-ink/55"
									>{new Date(t.createdAt).toLocaleDateString(undefined, {
										month: 'short',
										day: 'numeric'
									})} · {status(t)}</span
								>
							</span>
							<ArrowRight size={18} class="text-ink/40" aria-hidden="true" />
						</a>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</div>
