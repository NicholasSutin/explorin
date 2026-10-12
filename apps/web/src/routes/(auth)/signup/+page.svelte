<script lang="ts">
	import { page } from '$app/state';
	import AuthField from '#lib/components/AuthField.svelte';
	import Turnstile from '#lib/components/Turnstile.svelte';
	import { authClient, captchaHeaders } from '#lib/auth-client';
	import Mail from '@lucide/svelte/icons/mail';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let email = $state('');
	let token = $state('');
	let busy = $state(false);
	let sent = $state(false);
	let err = $state('');
	let resetTurnstile = $state<() => void>(() => {});
	const ready = $derived(email.trim() !== '' && token !== '' && !busy);
	// /api/auth/magic-link/verify sends a bad or spent link back here with ?error=INVALID_TOKEN.
	const linkFailed = $derived(page.url.searchParams.has('error'));

	async function submit() {
		if (!ready) return;
		busy = true;
		err = '';
		// Opening the link creates the account (email already verified) and signs it in; both landings go to the
		// password step, which forwards accounts that already have one. A bad link comes back to this page.
		const { error } = await authClient.signIn.magicLink(
			{
				email: email.trim(),
				callbackURL: '/signup/password',
				newUserCallbackURL: '/signup/password',
				errorCallbackURL: '/signup'
			},
			{ headers: captchaHeaders(token) }
		);
		busy = false;
		if (error) {
			resetTurnstile();
			err = error.message || 'Could not send the link. Please try again.';
			return;
		}
		sent = true;
	}

	function startOver() {
		sent = false;
		token = '';
	}
</script>

<svelte:head><title>Explorin · Create account</title></svelte:head>

{#if sent}
	<div
		class="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-700"
	>
		<Mail size={28} aria-hidden="true" />
	</div>
	<h1 class="mt-6 text-3xl leading-tight font-semibold">Check your inbox.</h1>
	<p class="mt-3 text-neutral-600" role="status">
		We sent a link to <strong class="text-neutral-900">{email.trim()}</strong>. Open it to confirm
		your email and choose a password.
	</p>
	<p class="mt-3 text-sm text-neutral-500">
		The link works for one hour. Check spam if it is slow.
	</p>
	<div class="mt-8 space-y-3">
		<button
			type="button"
			onclick={startOver}
			class="h-12 w-full rounded-full bg-white font-medium ring-1 ring-neutral-300"
		>
			Use a different email
		</button>
		<a href="/login" class="block text-center text-sm text-neutral-600">Back to sign in</a>
	</div>
{:else}
	<h1 class="text-3xl leading-tight font-semibold">Make it yours.</h1>
	<p class="mt-2 text-neutral-600">
		An account keeps your scrapbooks, your taste profile and your "people like you" voices together.
	</p>

	{#if linkFailed}
		<p class="mt-5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900" role="alert">
			That link has expired or was already used. Enter your email and we will send a fresh one.
		</p>
	{/if}

	{#if !data.authReady}
		<p class="mt-6 text-sm text-red-700" role="alert">
			Accounts are not set up on this deployment yet. The NYC demo on the home page works without
			one.
		</p>
	{:else}
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
				{busy ? 'Sending…' : 'Send me a link'}
			</button>
			<p class="text-xs text-neutral-500">
				We email one link to confirm your address; you choose a password after opening it. No
				newsletters, no sharing.
			</p>
		</form>
		<p class="mt-6 text-center text-sm text-neutral-600">
			Already have an account? <a href="/login" class="font-medium text-accent-dark">Sign in</a>
		</p>
	{/if}
{/if}
