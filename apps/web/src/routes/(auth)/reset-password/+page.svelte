<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import AuthField from '#lib/components/AuthField.svelte';
	import { authClient } from '#lib/auth-client';

	// better-auth redirects here with ?token=… after checking the emailed link, or ?error=INVALID_TOKEN.
	const token = $derived(page.url.searchParams.get('token') ?? '');
	const invalid = $derived(!token || page.url.searchParams.get('error') !== null);
	let password = $state('');
	let confirm = $state('');
	let busy = $state(false);
	let err = $state('');
	const ready = $derived(password.length >= 8 && password === confirm && !busy);

	async function submit() {
		if (!ready) return;
		busy = true;
		err = '';
		const { error } = await authClient.resetPassword({ newPassword: password, token });
		if (error) {
			busy = false;
			err =
				error.code === 'INVALID_TOKEN'
					? 'This link has expired. Request a new one below.'
					: error.message || 'Could not update your password. Please try again.';
			return;
		}
		await goto('/login?reset=1');
	}
</script>

<svelte:head><title>Explorin · New password</title></svelte:head>

<h1 class="text-3xl leading-tight font-semibold">Choose a new password.</h1>

{#if invalid}
	<p class="mt-3 text-neutral-600" role="alert">
		This reset link is not valid any more. Links work once, for one hour.
	</p>
	<a
		href="/forgot"
		class="mt-8 flex h-14 w-full items-center justify-center rounded-full bg-accent text-lg font-semibold text-white"
	>
		Request a new link
	</a>
{:else}
	<form
		class="mt-8 space-y-5"
		onsubmit={(e) => {
			e.preventDefault();
			submit();
		}}
	>
		<AuthField
			label="New password"
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
		{#if err}<p class="text-sm text-red-600" role="alert">{err}</p>{/if}
		<button
			type="submit"
			disabled={!ready}
			class="h-14 w-full rounded-full bg-accent text-lg font-semibold text-white active:scale-[0.98] disabled:opacity-40"
		>
			{busy ? 'Saving…' : 'Save password'}
		</button>
	</form>
{/if}
