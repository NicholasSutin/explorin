<script lang="ts">
	/** Phone frame plus the Ask / You tabs for the profile-based flow. */
	import { page } from '$app/state';
	import type { LayoutProps } from './$types';
	let { children }: LayoutProps = $props();
	const tabs = [
		{ href: '/ask', label: 'Ask' },
		{ href: '/profile', label: 'You' }
	];
</script>

<div class="mx-auto flex min-h-dvh max-w-[430px] flex-col">
	<header
		class="sticky top-0 z-10 flex items-center justify-between bg-neutral-50/90 px-5 py-3 backdrop-blur"
	>
		<a href="/ask" class="text-xl font-semibold tracking-tight text-accent-dark">Felt</a>
		<nav class="flex gap-1 text-sm">
			{#each tabs as t}
				<a
					href={t.href}
					class="rounded-full px-3 py-1.5 {page.url.pathname.startsWith(t.href)
						? 'bg-neutral-900 text-white'
						: 'text-neutral-600'}">{t.label}</a
				>
			{/each}
		</nav>
	</header>
	<main class="flex-1 px-4 pb-32">{@render children()}</main>
</div>
