<script lang="ts">
	/** Guest landing: what Explorin does in three beats, and the way in. Everything else needs an account. */
	import { page } from '$app/state';
	const deleted = $derived(page.url.searchParams.has('deleted'));
	const postcards = [
		{
			src: '/marketing/high-line-fall.webp',
			film: 'film-warm',
			note: 'the high line, late october',
			tilt: '-rotate-6'
		},
		{
			src: '/marketing/brooklyn-bridge.webp',
			film: 'film-moss',
			note: 'dumbo, golden hour',
			tilt: 'rotate-3'
		},
		{
			src: '/marketing/the-met-inside.webp',
			film: 'film-fade',
			note: 'the met, a quiet wing',
			tilt: '-rotate-2'
		}
	];
	const beats = [
		{
			n: '01',
			t: 'Tell us your taste',
			d: 'A few words and a quick tier list. S+ for pastries, NO for crowds.'
		},
		{
			n: '02',
			t: 'Get a day on a living map',
			d: 'Real places, today’s happenings, and a route you can hand to Maps.'
		},
		{
			n: '03',
			t: 'Keep it in your scrapbook',
			d: 'A note, a few photos, who it’s best for. Share it as a story.'
		}
	];
</script>

<svelte:head>
	<title>Explorin · Days that feel like you</title>
	<meta
		name="description"
		content="Tell Explorin what you love, get a day out on a living map, and keep it in a scrapbook."
	/>
	<meta property="og:image" content="/brand/og-card-green-1200.png" />
</svelte:head>

<div class="min-h-dvh bg-[url('/brand/pattern-tile.svg')] bg-[length:720px] bg-top">
	<div class="min-h-dvh bg-cream/90">
		<header class="mx-auto flex max-w-5xl items-center justify-between px-5 py-5 sm:px-8">
			<img src="/brand/lockup-horizontal-ink.svg" alt="explorin." class="h-7 w-auto" />
			<a href="/login" class="rounded-full px-4 py-2 text-sm font-medium text-ink/80 hover:bg-moss"
				>Sign in</a
			>
		</header>

		{#if deleted}
			<p class="mx-auto max-w-5xl px-5 sm:px-8" role="status">
				<span class="block rounded-2xl bg-moss px-4 py-3 text-sm"
					>Your account and everything in it has been deleted.</span
				>
			</p>
		{/if}
		<main
			class="mx-auto grid max-w-5xl gap-12 px-5 pt-6 pb-16 sm:px-8 md:grid-cols-[1.1fr_1fr] md:items-center md:pt-14"
		>
			<section>
				<p class="text-xs font-semibold tracking-[0.2em] text-orange">
					LESS SCROLLING. MORE STORIES.
				</p>
				<h1 class="mt-3 font-serif text-[2.6rem] leading-[1.05] font-semibold text-ink sm:text-6xl">
					Your next good day is closer than <em class="text-green">you think.</em>
				</h1>
				<p class="mt-5 max-w-md text-lg text-ink/75">
					Explorin learns what you love, plans a day of real places around it, and keeps the story
					when you’re done.
				</p>
				<div class="mt-8 flex flex-col gap-3 sm:flex-row">
					<a
						href="/signup"
						class="flex h-14 items-center justify-center rounded-full bg-ink px-8 text-lg font-semibold text-cream active:scale-[0.98]"
						>Create your account</a
					>
					<a
						href="/login"
						class="flex h-14 items-center justify-center rounded-full px-8 text-lg font-medium text-ink ring-1 ring-ink/20 hover:bg-moss"
						>I have one</a
					>
				</div>
				<p class="mt-4 text-sm text-ink/55">Free. New York first, more cities soon.</p>
			</section>

			<div class="relative mx-auto h-[420px] w-full max-w-sm sm:h-[460px]" aria-hidden="true">
				{#each postcards as card, i (card.src)}
					<figure
						class="absolute w-[62%] bg-white p-2.5 pb-9 shadow-[0_14px_30px_-12px_rgba(32,61,50,0.45)] {card.tilt}"
						style="left: {[2, 34, 16][i]}%; top: {[4, 18, 44][i]}%; z-index: {i + 1}"
					>
						<img src={card.src} alt="" class="aspect-[4/5] w-full object-cover {card.film}" />
						<figcaption class="absolute inset-x-3 bottom-2 font-hand text-lg text-ink/80">
							{card.note}
						</figcaption>
					</figure>
				{/each}
				<img
					src="/brand/mark-orange.svg"
					alt=""
					class="absolute right-2 bottom-0 h-14 w-14 rotate-12"
				/>
			</div>
		</main>

		<section class="mx-auto grid max-w-5xl gap-4 px-5 pb-20 sm:grid-cols-3 sm:px-8">
			{#each beats as b (b.n)}
				<div class="rounded-2xl bg-paper p-5 ring-1 ring-ink/10">
					<p class="font-mono text-xs text-orange">{b.n}</p>
					<h2 class="mt-2 font-serif text-xl font-semibold">{b.t}</h2>
					<p class="mt-1 text-sm text-ink/70">{b.d}</p>
				</div>
			{/each}
		</section>
	</div>
</div>
