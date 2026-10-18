<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import AuthField from '#lib/components/AuthField.svelte';
	import Turnstile from '#lib/components/Turnstile.svelte';
	import { authClient, captchaHeaders, safeNext } from '#lib/auth-client';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let email = $state('');
	let password = $state('');
	let token = $state('');
	let busy = $state(false);
	let err = $state('');
	let unverified = $state(false);
	let resetTurnstile = $state<() => void>(() => {});
	const next = $derived(safeNext(page.url.searchParams.get('next')));
	const justReset = $derived(page.url.searchParams.has('reset'));
	const ready = $derived(email.trim() !== '' && password !== '' && token !== '' && !busy);

	async function submit() {
		if (!ready) return;
		busy = true;
		err = '';
		unverified = false;
		// `callbackURL` only matters when the account is unverified: it is where the fresh confirmation link
		// lands. /onboarding forwards onboarded accounts home, so it is the right landing for both cases.
		const { error } = await authClient.signIn.email(
			{ email: email.trim(), password, callbackURL: next === '/' ? '/onboarding' : next },
			{ headers: captchaHeaders(token) }
		);
		if (error) {
			busy = false;
			resetTurnstile();
			if (error.status === 403) {
				// Not verified yet; the server has just sent a fresh link (sendOnSignIn).
				unverified = true;
				return;
			}
			err =
				error.status === 401
					? 'That email and password do not match.'
					: error.message || 'Could not sign you in. Please try again.';
			return;
		}
		await goto(next, { invalidateAll: true });
	}
</script>

<svelte:head><title>Explorin · Sign in</title></svelte:head>

<h1 class="text-3xl leading-tight font-semibold">Welcome back.</h1>
<p class="mt-2 text-neutral-600">Sign in to keep your adventures and your profile.</p>

{#if justReset}
	<p class="mt-5 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">
		Your password is updated. Sign in with the new one.
	</p>
{/if}

{#if !data.authReady}
	<p class="mt-6 text-sm text-red-700" role="alert">
		Accounts are not set up on this deployment yet.
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
		<AuthField
			label="Password"
			type="password"
			name="password"
			autocomplete="current-password"
			required
			bind:value={password}
		/>
		<Turnstile action="auth" onToken={(t) => (token = t)} bind:reset={resetTurnstile} />
		{#if unverified}
			<p class="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900" role="status">
				Please confirm your email first. We just sent a new link to <strong>{email}</strong>.
			</p>
		{/if}
		{#if err}<p class="text-sm text-red-600" role="alert">{err}</p>{/if}
		<button
			type="submit"
			disabled={!ready}
			class="h-14 w-full rounded-full bg-accent text-lg font-semibold text-white active:scale-[0.98] disabled:opacity-40"
		>
			{busy ? 'Signing in…' : 'Sign in'}
		</button>
	</form>
	<div class="mt-6 flex items-center justify-between text-sm">
		<a href="/forgot" class="text-neutral-600 underline-offset-2 hover:underline"
			>Forgot password?</a
		>
		<a href="/signup?next={encodeURIComponent(next)}" class="font-medium text-accent-dark">
			Create an account
		</a>
	</div>
{/if}
