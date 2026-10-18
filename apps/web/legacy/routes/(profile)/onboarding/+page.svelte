<script lang="ts">
	/** One screen after email confirmation: name, home city, a few interests. Photos come next and are optional. */
	import { enhance } from '$app/forms';
	import { fade } from 'svelte/transition';
	import BottomBar from '#lib/components/BottomBar.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	// Initial values only: after a failed submit the bound inputs already hold what was typed.
	// svelte-ignore state_referenced_locally
	let name = $state(form?.name ?? data.name);
	// svelte-ignore state_referenced_locally
	let homeCity = $state(form?.homeCity ?? 'New York City');
	// svelte-ignore state_referenced_locally
	let interests = $state<string[]>(form?.interests ?? ['Nature']);
	let busy = $state(false);
	const ready = $derived(name.trim().length > 0 && homeCity.trim().length > 0 && !busy);

	function toggle(t: string) {
		interests = interests.includes(t) ? interests.filter((x) => x !== t) : [...interests, t];
	}
</script>

<svelte:head><title>Explorin · Welcome</title></svelte:head>

<div class="pt-10" in:fade>
	<p class="text-sm font-medium text-accent-dark">Welcome to Explorin</p>
	<h1 class="mt-1 text-3xl leading-tight font-semibold">Three quick things, then go explore.</h1>
	<p class="mt-3 text-neutral-600">
		This shapes your first recommendations. You can change it any time.
	</p>

	<form
		id="onboarding"
		method="POST"
		class="mt-8 space-y-6"
		use:enhance={() => {
			busy = true;
			return async ({ update }) => {
				await update();
				busy = false;
			};
		}}
	>
		<label class="block">
			<span class="text-sm font-medium">What should we call you?</span>
			<input
				name="name"
				bind:value={name}
				required
				maxlength="40"
				autocomplete="given-name"
				placeholder="Maya"
				class="mt-1 h-12 w-full rounded-xl border border-neutral-300 bg-white px-4 text-base outline-none focus:border-accent"
			/>
		</label>
		<label class="block">
			<span class="text-sm font-medium">Your home city</span>
			<span class="ml-1 text-xs text-neutral-500">(New York is open; more cities soon)</span>
			<input
				name="homeCity"
				bind:value={homeCity}
				required
				maxlength="60"
				autocomplete="address-level2"
				class="mt-1 h-12 w-full rounded-xl border border-neutral-300 bg-white px-4 text-base outline-none focus:border-accent"
			/>
		</label>
		<fieldset>
			<legend class="text-sm font-medium">What kind of days do you like?</legend>
			<div class="mt-2 flex flex-wrap gap-2">
				{#each data.topics as t (t)}
					{@const on = interests.includes(t)}
					<label
						class="cursor-pointer rounded-full px-3 py-2 text-sm ring-1 select-none {on
							? 'bg-neutral-900 text-white ring-neutral-900'
							: 'bg-white text-neutral-700 ring-neutral-200'}"
					>
						<input
							type="checkbox"
							name="interests"
							value={t}
							checked={on}
							onchange={() => toggle(t)}
							class="sr-only"
						/>
						{t}
					</label>
				{/each}
			</div>
		</fieldset>
		{#if form?.message}<p class="text-sm text-red-600" role="alert">{form.message}</p>{/if}
	</form>
</div>
<BottomBar>
	<button
		type="submit"
		form="onboarding"
		disabled={!ready}
		class="h-14 w-full rounded-full bg-accent text-lg font-semibold text-white active:scale-[0.98] disabled:opacity-40"
	>
		{busy ? 'Saving…' : 'Continue'}
	</button>
</BottomBar>
