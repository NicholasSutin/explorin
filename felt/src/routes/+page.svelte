<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import PhotoPicker from '#lib/components/PhotoPicker.svelte';
	import BottomBar from '#lib/components/BottomBar.svelte';
	import Loader from '#lib/components/Loader.svelte';
	import { createProfile, getProfile, uploadPhotos } from '#lib/client';

	let name = $state('');
	let bio = $state('');
	let files = $state<File[]>([]);
	let busy = $state(false);
	let err = $state('');
	let ready = $derived(name.trim().length > 0 && files.length >= 1 && !busy);

	onMount(async () => {
		try {
			if ((await getProfile()).profile) goto('/ask');
		} catch {
			/* no DB yet; stay */
		}
	});

	async function submit() {
		if (!ready) return;
		busy = true;
		err = '';
		try {
			const urls = await uploadPhotos(files);
			await createProfile(name.trim(), urls, bio.trim() || undefined);
			goto('/profile');
		} catch (e: any) {
			err = e.message ?? 'Something went wrong';
			busy = false;
		}
	}
</script>

<svelte:head><title>Felt · Start</title></svelte:head>

{#if busy}
	<Loader
		stages={['Uploading your photos', 'Looking at what you love', 'Writing your outdoor profile']}
	/>
{:else}
	<div class="pt-10" in:fade>
		<p class="text-sm font-medium text-accent-dark">Felt</p>
		<h1 class="mt-1 text-3xl leading-tight font-semibold">
			Places recommended by how people like you felt there.
		</h1>
		<p class="mt-3 text-neutral-600">A few photos tell us who you are outdoors. No sign-in.</p>

		<form
			class="mt-8 space-y-6"
			onsubmit={(e) => {
				e.preventDefault();
				submit();
			}}
		>
			<label class="block">
				<span class="text-sm font-medium">First name</span>
				<input
					bind:value={name}
					required
					maxlength="40"
					autocomplete="given-name"
					placeholder="Maya"
					class="mt-1 h-12 w-full rounded-xl border border-neutral-300 bg-white px-4 text-base outline-none focus:border-accent"
				/>
			</label>
			<div>
				<span class="text-sm font-medium">3 to 5 photos of you outside</span>
				<p class="mb-2 text-xs text-neutral-500">
					Location data is removed before upload. Photos only shape your profile.
				</p>
				<PhotoPicker bind:files />
			</div>
			<label class="block">
				<span class="text-sm font-medium"
					>One line about you <span class="text-neutral-400">(optional)</span></span
				>
				<input
					bind:value={bio}
					maxlength="200"
					placeholder="Early riser, runs along the river, loves a skyline"
					class="mt-1 h-12 w-full rounded-xl border border-neutral-300 bg-white px-4 text-base outline-none focus:border-accent"
				/>
			</label>
			{#if err}<p class="text-sm text-red-600">{err}</p>{/if}
		</form>
	</div>
	<BottomBar>
		<button
			type="button"
			disabled={!ready}
			onclick={submit}
			class="h-14 w-full rounded-full bg-accent text-lg font-semibold text-white active:scale-[0.98] disabled:opacity-40"
		>
			Build my profile
		</button>
	</BottomBar>
{/if}
