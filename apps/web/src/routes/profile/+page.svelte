<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { fade } from 'svelte/transition';
	import TraitChip from '#lib/components/TraitChip.svelte';
	import BottomBar from '#lib/components/BottomBar.svelte';
	import { getProfile } from '#lib/client';
	import type { Profile } from '#lib/types';

	let profile = $state<Profile | null>(null);
	let loading = $state(true);
	onMount(async () => {
		try {
			profile = (await getProfile()).profile;
		} finally {
			loading = false;
		}
		if (!profile) goto('/');
	});
</script>

<svelte:head><title>Felt · You</title></svelte:head>

{#if profile}
	{@const t = profile.traits}
	<div class="pt-4" in:fade>
		<div class="flex items-center gap-4">
			<div
				class="flex h-16 w-16 items-center justify-center rounded-full bg-accent text-2xl font-semibold text-white"
			>
				{(profile.name ?? '?')[0]}
			</div>
			<div>
				<h1 class="text-2xl font-semibold">{profile.name}</h1>
				<p class="text-sm text-neutral-500">{t.pace} pace · {t.social.replace('_', ' ')}</p>
			</div>
		</div>
		<p class="mt-5 text-[17px] leading-relaxed text-neutral-800">{t.summary}</p>

		<section class="mt-7">
			<h2 class="text-xs font-semibold tracking-wide text-neutral-500 uppercase">
				What you do <span class="font-normal normal-case">(tap for evidence)</span>
			</h2>
			<div class="mt-2 flex flex-wrap gap-2">
				{#each t.activities as a, i (a.name)}<TraitChip
						label={a.name}
						evidence={a.evidence}
						confidence={a.confidence}
						tone="accent"
						delay={i * 60}
					/>{/each}
			</div>
		</section>
		{#if t.scenery.length}
			<section class="mt-5">
				<h2 class="text-xs font-semibold tracking-wide text-neutral-500 uppercase">
					Scenery you love
				</h2>
				<div class="mt-2 flex flex-wrap gap-2">
					{#each t.scenery as s, i (s)}<TraitChip label={s} delay={i * 50} />{/each}
				</div>
			</section>
		{/if}
		{#if t.values.length || t.time_of_day.length}
			<section class="mt-5">
				<h2 class="text-xs font-semibold tracking-wide text-neutral-500 uppercase">What matters</h2>
				<div class="mt-2 flex flex-wrap gap-2">
					{#each [...t.values, ...t.time_of_day] as v, i (v)}<TraitChip
							label={v}
							delay={i * 50}
						/>{/each}
				</div>
			</section>
		{/if}
		{#if t.avoid.length}
			<section class="mt-5">
				<h2 class="text-xs font-semibold tracking-wide text-neutral-500 uppercase">Rather avoid</h2>
				<div class="mt-2 flex flex-wrap gap-2">
					{#each t.avoid as v (v)}<TraitChip label={v} />{/each}
				</div>
			</section>
		{/if}
		<p class="mt-8 text-xs text-neutral-400">
			We never infer health, religion, ethnicity, sexuality, politics, or income. <a
				href="/"
				class="underline">Start over</a
			>
		</p>
	</div>
	<BottomBar>
		<a
			href="/ask"
			class="flex h-14 w-full items-center justify-center rounded-full bg-accent text-lg font-semibold text-white active:scale-[0.98]"
			>Ask for an experience</a
		>
	</BottomBar>
{:else if loading}
	<p class="pt-10 text-center text-neutral-500">Loading…</p>
{/if}
