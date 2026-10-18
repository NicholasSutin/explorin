<script lang="ts">
	/** Onboarding 1 of 2: who you are, what you like to explore in your own words, broad interests, who you plan for. */
	import { enhance } from '$app/forms';
	import { fade } from 'svelte/transition';
	import { AUDIENCES, INTERESTS } from '#lib/taste';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	// Initial values only: after a failed submit the bound inputs already hold what was typed.
	// svelte-ignore state_referenced_locally
	let name = $state(form?.name ?? data.name);
	// svelte-ignore state_referenced_locally
	let homeCity = $state(form?.homeCity ?? data.homeCity);
	// svelte-ignore state_referenced_locally
	let blurb = $state(form?.blurb ?? data.blurb);
	// svelte-ignore state_referenced_locally
	let interests = $state<string[]>(form?.interests ?? data.interests);
	// svelte-ignore state_referenced_locally
	let audience = $state<string[]>(form?.audience ?? data.audience);
	let busy = $state(false);
	const ready = $derived(
		name.trim() !== '' &&
			homeCity.trim().length >= 2 &&
			blurb.trim().length >= 12 &&
			interests.length > 0 &&
			!busy
	);
	const sparks = [
		'Quiet mornings, a great pastry, then walking until my feet give up.',
		'Anything with a view. I’ll climb stairs for a skyline.',
		'Cheap eats and weird little museums nobody talks about.'
	];
	const toggle = (list: string[], v: string) =>
		list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
	const chip = (on: boolean) =>
		`cursor-pointer select-none rounded-full px-3.5 py-2 text-sm ring-1 transition ${
			on ? 'bg-ink text-cream ring-ink' : 'bg-paper text-ink/80 ring-ink/15 hover:ring-ink/40'
		}`;
</script>

<svelte:head><title>Explorin · About you</title></svelte:head>

<div in:fade>
	<p class="text-sm font-medium text-orange">Welcome to Explorin</p>
	<h1 class="mt-1 font-serif text-4xl leading-tight font-semibold">
		Tell us how you like to explore.
	</h1>
	<p class="mt-3 text-ink/70">
		Two quick steps. This shapes every plan, and you can change it in Settings.
	</p>

	<form
		id="about"
		method="POST"
		class="mt-8 space-y-8"
		use:enhance={() => {
			busy = true;
			return async ({ update }) => {
				await update({ reset: false });
				busy = false;
			};
		}}
	>
		<div class="grid gap-4 sm:grid-cols-2">
			<label class="block">
				<span class="text-sm font-medium">What should we call you?</span>
				<input
					name="name"
					bind:value={name}
					required
					maxlength="40"
					autocomplete="given-name"
					placeholder="Maya"
					class="mt-1 h-12 w-full rounded-xl border border-ink/20 bg-white px-4 text-base outline-none focus:border-green"
				/>
			</label>
			<label class="block">
				<span class="text-sm font-medium">Home city</span>
				<input
					name="homeCity"
					bind:value={homeCity}
					required
					maxlength="60"
					autocomplete="address-level2"
					class="mt-1 h-12 w-full rounded-xl border border-ink/20 bg-white px-4 text-base outline-none focus:border-green"
				/>
				<span class="mt-1 block text-xs text-ink/50"
					>New York has happenings on the map; other cities get places only.</span
				>
			</label>
		</div>

		<div>
			<label for="blurb" class="text-sm font-medium"
				>In a sentence or two, what do you like to explore?</label
			>
			<textarea
				id="blurb"
				name="blurb"
				bind:value={blurb}
				required
				minlength="12"
				maxlength="600"
				rows="3"
				placeholder="Slow mornings, hidden courtyards, a good bakery, and a long walk with a view at the end…"
				class="mt-1 w-full resize-none rounded-2xl border border-ink/20 bg-white p-4 text-base outline-none focus:border-green"
			></textarea>
			<div class="mt-2 flex flex-wrap gap-2">
				{#each sparks as s (s)}
					<button
						type="button"
						onclick={() => (blurb = s)}
						class="rounded-full bg-moss px-3 py-1.5 text-left text-xs text-ink/80 hover:bg-moss/70"
						>{s}</button
					>
				{/each}
			</div>
		</div>

		<fieldset>
			<legend class="text-sm font-medium"
				>Your general interests <span class="font-normal text-ink/50">(pick a few)</span></legend
			>
			<div class="mt-2 flex flex-wrap gap-2">
				{#each INTERESTS as t (t)}
					{@const on = interests.includes(t)}
					<label class={chip(on)}>
						<input
							type="checkbox"
							name="interests"
							value={t}
							checked={on}
							onchange={() => (interests = toggle(interests, t))}
							class="sr-only"
						/>{t}
					</label>
				{/each}
			</div>
		</fieldset>

		<fieldset>
			<legend class="text-sm font-medium"
				>Who are you usually planning for? <span class="font-normal text-ink/50">(optional)</span
				></legend
			>
			<div class="mt-2 flex flex-wrap gap-2">
				{#each AUDIENCES as a (a)}
					{@const on = audience.includes(a)}
					<label class={chip(on)}>
						<input
							type="checkbox"
							name="audience"
							value={a}
							checked={on}
							onchange={() => (audience = toggle(audience, a))}
							class="sr-only"
						/>{a}
					</label>
				{/each}
			</div>
		</fieldset>
		{#if form?.message}<p class="text-sm text-red-700" role="alert">{form.message}</p>{/if}
	</form>
</div>

<div
	class="fixed inset-x-0 bottom-0 z-20 border-t border-ink/10 bg-paper/95 backdrop-blur"
	style="padding-bottom: env(safe-area-inset-bottom)"
>
	<div class="mx-auto max-w-2xl p-4">
		<button
			type="submit"
			form="about"
			disabled={!ready}
			class="h-14 w-full rounded-full bg-ink text-lg font-semibold text-cream active:scale-[0.98] disabled:opacity-40"
		>
			{busy ? 'Saving…' : 'Next: your taste →'}
		</button>
	</div>
</div>
