<script lang="ts">
	/**
	 * Settings: profile, what you like, taste, what trips taught Explorin, scrapbook motion, usage, password,
	 * sign out, delete everything.
	 */
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import Check from '@lucide/svelte/icons/check';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import X from '@lucide/svelte/icons/x';
	import { AUDIENCES, INTERESTS } from '#lib/taste';
	import TierBoard from '#lib/components/TierBoard.svelte';
	import UsageCard from '#lib/components/UsageCard.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	// svelte-ignore state_referenced_locally
	let interests = $state<string[]>(data.taste.interests);
	// svelte-ignore state_referenced_locally
	let audience = $state<string[]>(data.taste.audience);
	// svelte-ignore state_referenced_locally
	let flip = $state(data.taste.flip);
	let confirmText = $state('');
	let deleting = $state(false);
	const toggle = (list: string[], v: string) =>
		list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
	const chip = (on: boolean) =>
		`cursor-pointer select-none rounded-full px-3 py-1.5 text-sm ring-1 ${on ? 'bg-ink text-cream ring-ink' : 'bg-white text-ink/80 ring-ink/15'}`;
	const savedTaste = $derived(page.url.searchParams.get('saved') === 'taste');
	const msg = (section: string) =>
		form && 'section' in form && form.section === section ? form : null;
	const input =
		'mt-1 h-11 w-full rounded-xl border border-ink/15 bg-white px-3 text-base outline-none focus:border-green';
	const card = 'rounded-3xl bg-paper p-5 ring-1 ring-ink/10 sm:p-6';
	const h2 = 'font-serif text-2xl font-semibold';
</script>

{#snippet status(section: string)}
	{@const m = msg(section)}
	{#if m && 'message' in m && m.message}<p class="mt-3 text-sm text-red-700" role="alert">
			{m.message}
		</p>{/if}
	{#if m && 'saved' in m && m.saved}<p
			class="mt-3 flex items-center gap-1.5 text-sm text-green"
			role="status"
		>
			<Check size={15} aria-hidden="true" />Saved
		</p>{/if}
{/snippet}

<svelte:head><title>Explorin · Settings</title></svelte:head>

<div class="mx-auto max-w-2xl space-y-6 pt-2">
	<h1 class="font-serif text-4xl font-semibold">Settings</h1>

	<section class={card} aria-labelledby="s-profile">
		<h2 id="s-profile" class={h2}>Profile</h2>
		<form
			method="POST"
			action="?/account"
			use:enhance={() =>
				async ({ update }) =>
					update({ reset: false })}
			class="mt-4 grid gap-4 sm:grid-cols-2"
		>
			<label class="block text-sm font-medium"
				>Name<input
					name="name"
					value={data.account.name}
					required
					maxlength="40"
					class={input}
				/></label
			>
			<label class="block text-sm font-medium"
				>Home city<input
					name="homeCity"
					value={data.account.homeCity}
					required
					maxlength="60"
					class={input}
				/></label
			>
			<div class="sm:col-span-2">
				<button class="h-11 rounded-full bg-ink px-6 font-semibold text-cream">Save profile</button
				>{@render status('account')}
			</div>
		</form>
	</section>

	<section class={card} aria-labelledby="s-about">
		<h2 id="s-about" class={h2}>What you like</h2>
		<form
			method="POST"
			action="?/about"
			use:enhance={() =>
				async ({ update }) =>
					update({ reset: false })}
			class="mt-4 space-y-5"
		>
			<label class="block text-sm font-medium"
				>In your words
				<textarea
					name="blurb"
					required
					minlength="12"
					maxlength="600"
					rows="3"
					class="mt-1 w-full resize-none rounded-2xl border border-ink/15 bg-white p-3 text-base outline-none focus:border-green"
					>{data.taste.blurb}</textarea
				>
			</label>
			<fieldset>
				<legend class="text-sm font-medium">Interests</legend>
				<div class="mt-2 flex flex-wrap gap-2">
					{#each INTERESTS as t (t)}
						<label class={chip(interests.includes(t))}
							><input
								type="checkbox"
								name="interests"
								value={t}
								checked={interests.includes(t)}
								onchange={() => (interests = toggle(interests, t))}
								class="sr-only"
							/>{t}</label
						>
					{/each}
				</div>
			</fieldset>
			<fieldset>
				<legend class="text-sm font-medium">Usually planning for</legend>
				<div class="mt-2 flex flex-wrap gap-2">
					{#each AUDIENCES as a (a)}
						<label class={chip(audience.includes(a))}
							><input
								type="checkbox"
								name="audience"
								value={a}
								checked={audience.includes(a)}
								onchange={() => (audience = toggle(audience, a))}
								class="sr-only"
							/>{a}</label
						>
					{/each}
				</div>
			</fieldset>
			<div>
				<button class="h-11 rounded-full bg-ink px-6 font-semibold text-cream">Save</button
				>{@render status('about')}
			</div>
		</form>
	</section>

	<section class={card} aria-labelledby="s-taste">
		<div class="flex items-center justify-between gap-3">
			<h2 id="s-taste" class={h2}>Your tier list</h2>
			<a
				href="/onboarding/taste"
				class="rounded-full px-4 py-2 text-sm font-medium ring-1 ring-ink/20 hover:bg-moss"
				>Re-grade</a
			>
		</div>
		{#if savedTaste}<p class="mt-2 flex items-center gap-1.5 text-sm text-green" role="status">
				<Check size={15} aria-hidden="true" />Taste saved; your next plan uses it.
			</p>{/if}
		<div class="mt-4"><TierBoard grades={data.taste.grades} compact /></div>
	</section>

	<section class={card} aria-labelledby="s-learned">
		<h2 id="s-learned" class={h2}>Learned from your trips</h2>
		<p class="mt-1 text-sm text-ink/60">
			Phrases you kept from your trip notes. Your plans take them into account.
		</p>
		{#if data.taste.learned.length}
			<ul class="mt-4 flex flex-wrap gap-2">
				{#each data.taste.learned as phrase (phrase)}
					<li class="flex items-center gap-1 rounded-full bg-moss py-1 pr-1 pl-3 text-sm">
						{phrase}
						<form
							method="POST"
							action="?/forget"
							use:enhance={() =>
								async ({ update }) =>
									update({ reset: false })}
						>
							<input type="hidden" name="phrase" value={phrase} />
							<button
								aria-label="Forget “{phrase}”"
								class="grid h-8 w-8 place-items-center rounded-full hover:bg-ink/10"
								><X size={14} aria-hidden="true" /></button
							>
						</form>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="mt-4 text-sm text-ink/50">
				Nothing yet. After a trip, Explorin may suggest a phrase or two from your note, and you
				choose what it keeps.
			</p>
		{/if}
	</section>

	<section class={card} aria-labelledby="s-book">
		<h2 id="s-book" class={h2}>Scrapbook</h2>
		<form
			method="POST"
			action="?/flip"
			use:enhance={() =>
				async ({ update }) =>
					update({ reset: false })}
			class="mt-3"
		>
			<label class="flex items-center justify-between gap-4">
				<span
					><span class="font-medium">Page-flip animations</span><span
						class="block text-sm text-ink/60"
						>Off swaps pages instantly. Reduced-motion settings always win.</span
					></span
				>
				<input
					type="checkbox"
					name="flip"
					bind:checked={flip}
					onchange={(e) => e.currentTarget.form?.requestSubmit()}
					class="h-6 w-6 shrink-0 accent-[#285c47]"
				/>
			</label>
			{@render status('flip')}
		</form>
	</section>

	<section class={card} aria-labelledby="s-usage">
		<h2 id="s-usage" class="{h2} mb-4">Backend usage</h2>
		<UsageCard usage={data.usage} />
	</section>

	<section class={card} aria-labelledby="s-account">
		<h2 id="s-account" class={h2}>Account</h2>
		<p class="mt-2 text-sm text-ink/70">Signed in as <strong>{data.account.email}</strong></p>
		{#if data.account.hasPassword}
			<form method="POST" action="?/password" use:enhance class="mt-5 grid gap-3 sm:grid-cols-3">
				<label class="block text-sm font-medium"
					>Current password<input
						name="current"
						type="password"
						autocomplete="current-password"
						required
						class={input}
					/></label
				>
				<label class="block text-sm font-medium"
					>New password<input
						name="next"
						type="password"
						autocomplete="new-password"
						minlength="8"
						required
						class={input}
					/></label
				>
				<label class="block text-sm font-medium"
					>Repeat it<input
						name="confirm"
						type="password"
						autocomplete="new-password"
						minlength="8"
						required
						class={input}
					/></label
				>
				<div class="sm:col-span-3">
					<button class="h-11 rounded-full px-6 font-semibold ring-1 ring-ink/20 hover:bg-moss"
						>Change password</button
					>{@render status('password')}
				</div>
			</form>
		{/if}
		<form method="POST" action="/signout" class="mt-5">
			<button class="h-11 rounded-full px-6 font-medium ring-1 ring-ink/20 hover:bg-moss"
				>Sign out</button
			>
		</form>
	</section>

	<section class="rounded-3xl bg-red-50 p-5 ring-1 ring-red-200 sm:p-6" aria-labelledby="s-delete">
		<h2 id="s-delete" class="{h2} text-red-900">Delete everything</h2>
		<p class="mt-2 text-sm text-red-900/80">
			Removes your account, taste profile, every trip and scrapbook page, your photos, your shared
			quotes and your usage history. This can’t be undone.
		</p>
		<form
			method="POST"
			action="?/delete"
			use:enhance={() => {
				deleting = true;
				return async ({ update }) => {
					await update();
					deleting = false;
				};
			}}
			class="mt-4 flex flex-col gap-3 sm:flex-row"
		>
			<label class="flex-1 text-sm font-medium text-red-900"
				>Type DELETE to confirm<input
					name="confirm"
					bind:value={confirmText}
					autocomplete="off"
					class="mt-1 h-11 w-full rounded-xl border border-red-300 bg-white px-3 text-base outline-none focus:border-red-600"
				/></label
			>
			<button
				disabled={confirmText.trim().toUpperCase() !== 'DELETE' || deleting}
				class="flex h-11 items-center justify-center gap-2 self-end rounded-full bg-red-700 px-6 font-semibold text-white disabled:opacity-40"
				><Trash2 size={16} aria-hidden="true" />{deleting
					? 'Deleting…'
					: 'Delete my account'}</button
			>
		</form>
		{@render status('delete')}
	</section>
</div>
