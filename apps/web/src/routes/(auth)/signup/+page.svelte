<script lang="ts">
	import { goto } from '$app/navigation';
	import AuthField from '#lib/components/AuthField.svelte';
	import Turnstile from '#lib/components/Turnstile.svelte';
	import { authClient, captchaHeaders } from '#lib/auth-client';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let name = $state('');
	let email = $state('');
	let password = $state('');
	let token = $state('');
	let busy = $state(false);
	let err = $state('');
	let resetTurnstile = $state<() => void>(() => {});
	const ready = $derived(
		name.trim().length > 0 && email.trim() !== '' && password.length >= 8 && token !== '' && !busy
	);

	async function submit() {
		if (!ready) return;
		busy = true;
		err = '';
		// The verification link lands on /onboarding; the server signs the user in when they open it.
		const { error } = await authClient.signUp.email(
			{ name: name.trim(), email: email.trim(), password, callbackURL: '/onboarding' },
			{ headers: captchaHeaders(token) }
		);
		if (error) {
			busy = false;
			resetTurnstile();
			err =
				error.code === 'USER_ALREADY_EXISTS'
					? 'There is already an account for that email. Try signing in.'
					: error.message || 'Could not create your account. Please try again.';
			return;
		}
		await goto(`/verify?email=${encodeURIComponent(email.trim())}`);
	}
</script>

<svelte:head><title>Explorin · Create account</title></svelte:head>

<h1 class="text-3xl leading-tight font-semibold">Make it yours.</h1>
<p class="mt-2 text-neutral-600">
	An account keeps your scrapbooks, your taste profile and your "people like you" voices together.
</p>

{#if !data.authReady}
	<p class="mt-6 text-sm text-red-700" role="alert">
		Accounts are not set up on this deployment yet. The NYC demo on the home page works without one.
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
			label="First name"
			name="name"
			autocomplete="given-name"
			required
			maxlength={40}
			placeholder="Maya"
			bind:value={name}
		/>
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
			hint="at least 8 characters"
			type="password"
			name="password"
			autocomplete="new-password"
			required
			minlength={8}
			maxlength={128}
			bind:value={password}
		/>
		<Turnstile action="auth" onToken={(t) => (token = t)} bind:reset={resetTurnstile} />
		{#if err}<p class="text-sm text-red-600" role="alert">{err}</p>{/if}
		<button
			type="submit"
			disabled={!ready}
			class="h-14 w-full rounded-full bg-accent text-lg font-semibold text-white active:scale-[0.98] disabled:opacity-40"
		>
			{busy ? 'Creating…' : 'Create account'}
		</button>
		<p class="text-xs text-neutral-500">
			We send one email to confirm your address. No newsletters, no sharing.
		</p>
	</form>
	<p class="mt-6 text-center text-sm text-neutral-600">
		Already have an account? <a href="/login" class="font-medium text-accent-dark">Sign in</a>
	</p>
{/if}
