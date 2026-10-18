<script lang="ts">
	/** Onboarding frame: logo and a two-step progress line, nothing to wander off to. */
	import { page } from '$app/state';
	import type { LayoutProps } from './$types';
	let { children }: LayoutProps = $props();
	const step = $derived(page.url.pathname.startsWith('/onboarding/taste') ? 2 : 1);
</script>

<div class="mx-auto flex min-h-dvh max-w-2xl flex-col px-5 pt-6 pb-40">
	<header class="flex items-center justify-between">
		<img src="/brand/lockup-horizontal-ink.svg" alt="explorin." class="h-6 w-auto" />
		<ol
			class="flex items-center gap-2 text-xs font-medium text-ink/60"
			aria-label="Onboarding progress"
		>
			{#each ['About you', 'Your taste'] as label, i (label)}
				<li class="flex items-center gap-2" aria-current={step === i + 1 ? 'step' : undefined}>
					<span
						class="flex h-6 w-6 items-center justify-center rounded-full text-[11px] {step > i
							? 'bg-ink text-cream'
							: 'ring-1 ring-ink/30'}">{i + 1}</span
					><span class="hidden sm:inline">{label}</span>
				</li>
				{#if i === 0}<li aria-hidden="true" class="h-px w-6 bg-ink/25"></li>{/if}
			{/each}
		</ol>
	</header>
	<main class="flex-1 pt-8">{@render children()}</main>
</div>
