<script lang="ts" module>
	import type { Trip } from '#lib/adventure';
	export type BookPage =
		| { kind: 'cover' }
		| { kind: 'contents' }
		| { kind: 'trip'; trip: Trip }
		| { kind: 'end' }
		| { kind: 'blank' };
</script>

<script lang="ts">
	/**
	 * A book of 3D leaves that turn around the spine. Wide screens show spreads (a leaf's front on the right, the
	 * previous leaf's back on the left); phones show one page and turn it away to the left. Swipe, arrow keys or
	 * the buttons turn pages; `flip` off (or reduced motion) swaps pages without the animation.
	 */
	import { onMount, type Snippet } from 'svelte';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';

	let {
		pages,
		page = $bindable(0),
		flip = true,
		render
	}: {
		pages: BookPage[];
		/** Index of the page to show (the right-hand one in a spread). */
		page?: number;
		flip?: boolean;
		render: Snippet<[BookPage, number]>;
	} = $props();

	let wide = $state(false);
	let reduced = $state(false);
	let width = $state(0);
	let height = $state(0);
	let animating = $state<number[]>([]);
	const animate = $derived(flip && !reduced);

	onMount(() => {
		const mq = window.matchMedia('(min-width: 900px)');
		const rm = window.matchMedia('(prefers-reduced-motion: reduce)');
		const update = () => {
			wide = mq.matches;
			reduced = rm.matches;
		};
		update();
		mq.addEventListener('change', update);
		rm.addEventListener('change', update);
		return () => {
			mq.removeEventListener('change', update);
			rm.removeEventListener('change', update);
		};
	});

	const list = $derived(
		wide && pages.length % 2 ? [...pages, { kind: 'blank' } as BookPage] : pages
	);
	const leaves = $derived(
		wide
			? Array.from({ length: Math.ceil(list.length / 2) }, (_, i) => ({
					front: list[2 * i],
					back: list[2 * i + 1] ?? null,
					fi: 2 * i,
					bi: 2 * i + 1
				}))
			: list.map((p, i) => ({ front: p, back: null as BookPage | null, fi: i, bi: -1 }))
	);
	/** Leaves turned so far. */
	const turned = $derived(Math.min(wide ? Math.ceil(page / 2) : page, leaves.length - 1));
	/** Page width: fit the box, leaving room under the book for the page controls. */
	const pw = $derived(
		Math.max(200, Math.min((wide ? width / 2 : width) - 8, ((height || 860) - 72) * 0.75))
	);
	const ph = $derived(pw * (4 / 3));

	function go(nextTurned: number) {
		const target = Math.max(0, Math.min(leaves.length - 1, nextTurned));
		if (target === turned) return;
		const lo = Math.min(target, turned);
		const hi = Math.max(target, turned);
		const moving = Array.from({ length: hi - lo }, (_, k) => lo + k);
		if (animate) {
			animating = moving;
			setTimeout(() => (animating = []), 750 + moving.length * 70);
		}
		page = wide ? target * 2 : target;
	}
	export function jump(p: number) {
		go(wide ? Math.ceil(p / 2) : p);
	}
	const next = () => go(turned + 1);
	const prev = () => go(turned - 1);

	let startX = 0;
	let startY = 0;
	function down(e: PointerEvent) {
		startX = e.clientX;
		startY = e.clientY;
	}
	function up(e: PointerEvent) {
		const dx = e.clientX - startX;
		if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(e.clientY - startY)) dx < 0 ? next() : prev();
	}
	function key(e: KeyboardEvent) {
		if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
		if (e.key === 'ArrowRight') next();
		else if (e.key === 'ArrowLeft') prev();
	}
	const z = (i: number) => (animating.includes(i) ? 500 + i : i < turned ? i : leaves.length - i);
</script>

<svelte:window onkeydown={key} />

<div
	class="flex h-full w-full flex-col items-center overflow-x-clip"
	bind:clientWidth={width}
	bind:clientHeight={height}
>
	<div
		class="book relative touch-pan-y select-none {wide ? '' : 'overflow-hidden rounded-r-md'}"
		style="width: {wide ? pw * 2 : pw}px; height: {ph}px; perspective: {pw * 4}px"
		onpointerdown={down}
		onpointerup={up}
		role="region"
		aria-roledescription="book"
		aria-label="Scrapbook"
	>
		{#if wide}
			<!-- page edges under the spread -->
			<div
				class="absolute inset-y-1 left-0 w-1/2 rounded-l-md bg-[#e9e1c9] shadow-[0_18px_40px_-16px_rgba(32,61,50,0.55)]"
				style="transform: translateX(-4px)"
			></div>
			<div
				class="absolute inset-y-1 right-0 w-1/2 rounded-r-md bg-[#e9e1c9] shadow-[0_18px_40px_-16px_rgba(32,61,50,0.55)]"
				style="transform: translateX(4px)"
			></div>
		{/if}
		{#each leaves as leaf, i (leaf.fi)}
			<div
				class="leaf absolute top-0"
				class:animated={animate}
				style="left: {wide ? pw : 0}px; width: {pw}px; height: {ph}px; z-index: {z(
					i
				)}; transform: rotateY({i < turned ? -180 : 0}deg); transition-delay: {animating.length > 1
					? Math.abs(animating.indexOf(i)) * 70
					: 0}ms"
				aria-hidden={!(i === turned || (wide && i === turned - 1))}
				inert={!(i === turned || (wide && i === turned - 1))}
			>
				<div class="face front">
					{@render render(leaf.front, leaf.fi)}
					<span class="shade"></span>
				</div>
				<div class="face back">
					{#if leaf.back}{@render render(leaf.back, leaf.bi)}{:else}<div
							class="h-full w-full bg-[#f4eedc]"
						></div>{/if}
					<span class="shade"></span>
				</div>
			</div>
		{/each}
		{#if wide}<div
				class="pointer-events-none absolute inset-y-0 left-1/2 z-[900] w-8 -translate-x-1/2 bg-gradient-to-r from-transparent via-ink/15 to-transparent"
			></div>{/if}
	</div>

	<div class="mt-5 flex items-center gap-4">
		<button
			type="button"
			onclick={prev}
			disabled={turned === 0}
			aria-label="Previous page"
			class="flex h-11 w-11 items-center justify-center rounded-full bg-paper ring-1 ring-ink/15 disabled:opacity-30"
			><ChevronLeft size={20} aria-hidden="true" /></button
		>
		<span class="min-w-24 text-center font-mono text-xs text-ink/55">
			{#if wide}{turned === 0 ? 'Cover' : `${turned * 2 - 1}–${turned * 2}`}{:else}{turned === 0
					? 'Cover'
					: turned}{/if} / {list.length - 1}
		</span>
		<button
			type="button"
			onclick={next}
			disabled={turned >= leaves.length - 1}
			aria-label="Next page"
			class="flex h-11 w-11 items-center justify-center rounded-full bg-paper ring-1 ring-ink/15 disabled:opacity-30"
			><ChevronRight size={20} aria-hidden="true" /></button
		>
	</div>
</div>

<style>
	.leaf {
		transform-style: preserve-3d;
		transform-origin: left center;
	}
	.leaf.animated {
		transition: transform 0.75s cubic-bezier(0.645, 0.045, 0.355, 1);
	}
	.face {
		position: absolute;
		inset: 0;
		overflow: hidden;
		backface-visibility: hidden;
		-webkit-backface-visibility: hidden;
		border-radius: 0 6px 6px 0;
		box-shadow: 0 18px 40px -18px rgba(32, 61, 50, 0.55);
	}
	.face.back {
		transform: rotateY(180deg);
		border-radius: 6px 0 0 6px;
	}
	.face :global(svg) {
		display: block;
		height: 100%;
		width: 100%;
	}
	/* Light falls off toward the spine, and a turning page darkens as it lifts. */
	.shade {
		pointer-events: none;
		position: absolute;
		inset: 0;
		background: linear-gradient(90deg, rgba(32, 61, 50, 0.16), rgba(32, 61, 50, 0) 9%);
	}
	.back .shade {
		background: linear-gradient(270deg, rgba(32, 61, 50, 0.16), rgba(32, 61, 50, 0) 9%);
	}
	.leaf.animated .shade {
		transition: opacity 0.75s;
	}
</style>
