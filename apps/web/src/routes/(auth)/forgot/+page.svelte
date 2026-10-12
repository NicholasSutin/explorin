<script lang="ts">
	import AuthField from '#lib/components/AuthField.svelte';
	import Turnstile from '#lib/components/Turnstile.svelte';
	import { authClient, captchaHeaders } from '#lib/auth-client';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let email = $state('');
	let token = $state('');
	let busy = $state(false);
	let done = $state(false);
	let err = $state('');
	let resetTurnstile = $state<() => void>(() => {});
	const ready = $derived(email.trim() !== '' && token !== '' && !busy);

	async function submit() {
		if (!ready) return;
		busy = true;
		err = '';
		const { error } = await authClient.requestPasswordReset(
			{ email: email.trim(), redirectTo: '/reset-password' },
			{ headers: captchaHeaders(token) }
		);
		busy = false;
		if (error) {
			resetTurnstile();
			err = error.message || 'Could not send the email. Please try again.';
			return;
		}
		done = true; // same answer whether or not the address exists
	}
</script>

<svelte:head><title>Explorin · Reset password</title></svelte:head>

<h1 class="text-3xl leading-tight font-semibold">Forgot your password?</h1>

{#if done}
	<p class="mt-3 text-neutral-600" role="status">
		If there is an account for <strong class="text-neutral-900">{email}</strong>, a reset link is on
		its way. It works for one hour.
	</p>
	<a href="/login" class="mt-8 block text-center text-sm text-neutral-600">Back to sign in</a>
{:else if !data.authReady}
	<p class="mt-6 text-sm text-red-700" role="alert">
		Accounts are not set up on this deployment yet.
	</p>
{:else}
	<p class="mt-2 text-neutral-600">Enter your email and we will send a link to choose a new one.</p>
	<form
		class="mt-8 space-y-5"
		onsubmit={(e) => {
			e.preventDefault();
			submit();
		}}
	>
		<AuthField
			label="Email"
			type="email"
			name="email"
			autocomplete="email"
			required
			inputmode="email"
			bind:value={email}
		/>
		<Turnstile action="auth" onToken={(t) => (token = t)} bind:reset={resetTurnstile} />
		{#if err}<p class="text-sm text-red-600" role="alert">{err}</p>{/if}
		<button
			type="submit"
			disabled={!ready}
			class="h-14 w-full rounded-full bg-accent text-lg font-semibold text-white active:scale-[0.98] disabled:opacity-40"
		>
			{busy ? 'Sending…' : 'Send reset link'}
		</button>
	</form>
	<a href="/login" class="mt-6 block text-center text-sm text-neutral-600">Back to sign in</a>
{/if}
