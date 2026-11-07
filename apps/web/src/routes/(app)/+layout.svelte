<script lang="ts">
	/** Signed-in shell: brand header, and Plan / Scrapbook / Settings as a bottom tab bar on phones. */
	import { page } from '$app/state';
	import Compass from '@lucide/svelte/icons/compass';
	import BookHeart from '@lucide/svelte/icons/book-heart';
	import Settings from '@lucide/svelte/icons/settings';
	import type { LayoutProps } from './$types';
	let { children }: LayoutProps = $props();

	const tabs = [
		{ href: '/', label: 'Plan', icon: Compass },
		{ href: '/scrapbook', label: 'Scrapbook', icon: BookHeart },
		{ href: '/settings', label: 'Settings', icon: Settings }
	];
	const current = (href: string) =>
		href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);
</script>

<div class="min-h-dvh bg-[url('/brand/pattern-tile.svg')] bg-[length:720px] bg-top">
	<div class="min-h-dvh bg-cream/90">
		<header class="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-8">
			<a href="/" aria-label="Explorin home" class="flex items-center">
				<img src="/brand/lockup-horizontal-ink.svg" alt="explorin." class="h-7 w-auto" />
			</a>
			<nav aria-label="Main" class="hidden gap-1 sm:flex">
				{#each tabs as t (t.href)}
					<a
						href={t.href}
						aria-current={current(t.href) ? 'page' : undefined}
						class="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition {current(
							t.href
						)
							? 'bg-ink text-cream'
							: 'text-ink/70 hover:bg-moss'}"><t.icon size={16} aria-hidden="true" />{t.label}</a
					>
				{/each}
			</nav>
		</header>
		<main class="mx-auto max-w-5xl px-4 pb-32 sm:px-8 sm:pb-16">{@render children()}</main>
	</div>
	<nav
		aria-label="Main"
		class="fixed inset-x-0 bottom-0 z-30 border-t border-ink/10 bg-paper/95 backdrop-blur sm:hidden"
		style="padding-bottom: env(safe-area-inset-bottom)"
	>
		<div class="mx-auto flex max-w-md justify-around px-2 pt-2 pb-1">
			{#each tabs as t (t.href)}
				<a
					href={t.href}
					aria-current={current(t.href) ? 'page' : undefined}
					class="flex min-w-20 flex-col items-center gap-0.5 rounded-xl px-3 py-1.5 text-[11px] font-medium {current(
						t.href
					)
						? 'text-orange'
						: 'text-ink/60'}"
					><t.icon
						size={22}
						strokeWidth={current(t.href) ? 2.4 : 1.8}
						aria-hidden="true"
					/>{t.label}</a
				>
			{/each}
		</div>
	</nav>
</div>
