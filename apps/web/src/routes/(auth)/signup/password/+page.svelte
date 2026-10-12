<script lang="ts">
	import { enhance } from '$app/forms';
	import AuthField from '#lib/components/AuthField.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let password = $state('');
	let confirm = $state('');
	let busy = $state(false);
	const ready = $derived(password.length >= 8 && password === confirm && !busy);
</script>

<svelte:head><title>Explorin · Choose a password</title></svelte:head>

<h1 class="text-3xl leading-tight font-semibold">Choose a password.</h1>
<p class="mt-2 text-neutral-600">
	<strong class="text-neutral-900">{data.email}</strong> is confirmed. Pick the password you will sign
	in with from now on.
</p>

<form
	method="POST"
	class="mt-8 space-y-5"
	use:enhance={() => {
		busy = true;
		return async ({ update }) => {
			busy = false;
			await update({ reset: false });
		};
	}}
>
	<AuthField
		label="Password"
		hint="at least 8 characters"
		type="password"
		name="password"
		autocomplete="new-password"
		required
		minlength={8}
		maxlength={128}
		bind:value={password}
	/>
	<AuthField
		label="Repeat it"
		type="password"
		name="confirm"
		autocomplete="new-password"
		required
		bind:value={confirm}
	/>
	{#if confirm && confirm !== password}
		<p class="text-sm text-amber-700">The two passwords differ.</p>
	{/if}
	{#if form?.message}<p class="text-sm text-red-600" role="alert">{form.message}</p>{/if}
	<button
		type="submit"
		disabled={!ready}
		class="h-14 w-full rounded-full bg-accent text-lg font-semibold text-white active:scale-[0.98] disabled:opacity-40"
	>
		{busy ? 'Saving…' : 'Save and continue'}
	</button>
</form>
