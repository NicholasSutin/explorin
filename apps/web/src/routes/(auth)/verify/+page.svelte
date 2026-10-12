<script lang="ts">
	import { page } from '$app/state';
	import { authClient } from '#lib/auth-client';

	const email = $derived(page.url.searchParams.get('email') ?? '');
	let sent = $state(false);
	let busy = $state(false);
	let err = $state('');

	async function resend() {
		if (!email || busy) return;
		busy = true;
		err = '';
		const { error } = await authClient.sendVerificationEmail({ email, callbackURL: '/onboarding' });
		busy = false;
		if (error) err = error.message || 'Could not resend right now. Try again in a minute.';
		else sent = true;
	}
</script>

<svelte:head><title>Explorin · Check your email</title></svelte:head>

<div class="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-3xl">✉️</div>
<h1 class="mt-6 text-3xl leading-tight font-semibold">Check your inbox.</h1>
<p class="mt-3 text-neutral-600">
	We sent a confirmation link{#if email}
		to <strong class="text-neutral-900">{email}</strong>{/if}. Open it on this device and you will
	land straight in the app.
</p>
<p class="mt-3 text-sm text-neutral-500">The link works for one hour. Check spam if it is slow.</p>

<div class="mt-8 space-y-3">
	{#if email}
		<button
			type="button"
			onclick={resend}
			disabled={busy || sent}
			class="h-12 w-full rounded-full bg-white font-medium ring-1 ring-neutral-300 disabled:opacity-50"
		>
			{sent ? 'Sent again' : busy ? 'Sending…' : 'Resend the link'}
		</button>
	{/if}
	{#if err}<p class="text-sm text-red-600" role="alert">{err}</p>{/if}
	<a href="/login" class="block text-center text-sm text-neutral-600">Back to sign in</a>
</div>
