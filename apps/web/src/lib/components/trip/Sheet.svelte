<script lang="ts">
	/**
	 * Phones: a sheet over the map that peeks (header only) or opens to most of the screen; drag the handle or tap
	 * it. Wider screens: a fixed side panel, always open. Reports how much map it covers so pins stay in view.
	 */
	import type { Snippet } from 'svelte';
	import { onMount } from 'svelte';
	let {
		open = $bindable(false),
		head,
		children,
		oncover
	}: {
		open?: boolean;
		head: Snippet;
		children: Snippet;
		oncover?: (inset: { bottom: number; left: number }) => void;
	} = $props();

	let el: HTMLElement;
	let wide = $state(false);
	let dragY = $state(0);
	let dragging = $state(false);
	let startY = 0;
	/** While dragging, follow the finger in the direction that would change the state. */
	const offset = $derived(dragging ? (open ? Math.max(0, dragY) : Math.min(0, dragY)) : 0);

	onMount(() => {
		const mq = window.matchMedia('(min-width: 768px)');
		const update = () => (wide = mq.matches);
		update();
		mq.addEventListener('change', update);
		const ro = new ResizeObserver(() => report());
		ro.observe(el);
		return () => {
			mq.removeEventListener('change', update);
			ro.disconnect();
		};
	});

	function report() {
		if (!el) return;
		oncover?.(
			wide ? { bottom: 0, left: el.offsetWidth } : { bottom: open ? 0 : el.offsetHeight, left: 0 }
		);
	}
	$effect(() => {
		void open;
		void wide;
		queueMicrotask(report);
	});

	function down(e: PointerEvent) {
		if (wide) return;
		dragging = true;
		startY = e.clientY;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}
	function move(e: PointerEvent) {
		if (dragging) dragY = e.clientY - startY;
	}
	function up() {
		if (!dragging) return;
		dragging = false;
		if (Math.abs(dragY) < 6) open = !open;
		else if (dragY < -40) open = true;
		else if (dragY > 40) open = false;
		dragY = 0;
	}
</script>

<section
	bind:this={el}
	aria-label="Trip details"
	class="fixed z-20 flex flex-col bg-paper shadow-[0_-12px_30px_-16px_rgba(32,61,50,0.5)] md:inset-y-0 md:left-0 md:w-[420px] md:rounded-none md:shadow-[12px_0_30px_-20px_rgba(32,61,50,0.5)] {wide
		? ''
		: 'inset-x-0 bottom-0 rounded-t-3xl'}"
	style={wide
		? ''
		: `height: ${open ? '86dvh' : 'auto'}; transform: translateY(${offset}px); transition: ${dragging ? 'none' : 'transform .25s ease'}; padding-bottom: env(safe-area-inset-bottom)`}
>
	{#if !wide}
		<button
			type="button"
			class="flex w-full touch-none justify-center pt-2.5 pb-1"
			aria-label={open ? 'Collapse details' : 'Expand details'}
			aria-expanded={open}
			onpointerdown={down}
			onpointermove={move}
			onpointerup={up}
			onpointercancel={up}
		>
			<span class="h-1.5 w-10 rounded-full bg-ink/20"></span>
		</button>
	{/if}
	<div class="px-4 pb-3 md:pt-5">{@render head()}</div>
	{#if open || wide}
		<div
			class="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-ink/10 px-4 pt-3 pb-6"
		>
			{@render children()}
		</div>
	{/if}
</section>
