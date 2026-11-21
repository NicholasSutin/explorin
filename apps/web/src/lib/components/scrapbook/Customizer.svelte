<script lang="ts">
	/**
	 * The scrapbook's decorating panel: "This page" styles the day in view (paper, pattern, accent, washi tape,
	 * frames, or a one-tap look), "Cover" styles the book (cloth, print, band, title, endpapers). Changes show on the
	 * book at once; the page saves them. A bottom sheet on phones, a column beside the book on wide screens.
	 */
	import { fly } from 'svelte/transition';
	import X from '@lucide/svelte/icons/x';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import Layers from '@lucide/svelte/icons/layers';
	import ColorRow from './ColorRow.svelte';
	import PaperPattern from './PaperPattern.svelte';
	import TapePattern from './TapePattern.svelte';
	import CoverPattern from './CoverPattern.svelte';
	import {
		COVER_PATTERNS,
		DEFAULT_COVER,
		LOOKS,
		PAPER_PATTERNS,
		PAPER_NAMES,
		COVER_NAMES,
		TAPE_NAMES,
		SWATCHES,
		TAPE_PATTERNS,
		TITLE_MAX,
		coverPalette,
		pagePalette,
		sameStyle,
		type CoverStyle,
		type PageStyle
	} from '#lib/scrapbook/style';

	let {
		tab,
		ontab,
		page,
		choices,
		onchoose,
		style,
		custom,
		onpage,
		onreset,
		onapplyall,
		pageCount,
		ongoto,
		cover,
		oncover,
		onresetcover,
		status,
		onclose
	}: {
		tab: 'page' | 'cover';
		ontab: (tab: 'page' | 'cover') => void;
		/** The page being styled: its number and the day's title; null when no day is in view. */
		page: { index: number; title: string } | null;
		/** Both days of an open spread, to choose between. */
		choices: { index: number; side: string }[];
		onchoose: (index: number) => void;
		style: PageStyle | null;
		/** Whether this page has a look of its own (else it follows the book's). */
		custom: boolean;
		onpage: (patch: Partial<PageStyle>) => void;
		onreset: () => void;
		onapplyall: () => void;
		pageCount: number;
		/** Turn to the first day, when none is in view. */
		ongoto: (() => void) | null;
		cover: CoverStyle;
		oncover: (patch: Partial<CoverStyle>) => void;
		onresetcover: () => void;
		status: 'idle' | 'saving' | 'saved' | 'error';
		onclose: () => void;
	} = $props();

	const uid = $props.id();
	const pal = $derived(style ? pagePalette(style) : null);
	const cpal = $derived(coverPalette(cover));
	let confirming = $state(false);
	$effect(() => {
		void page?.index;
		void tab;
		confirming = false;
	});
</script>

{#snippet heading(text: string)}
	<h3 class="mb-2.5 text-xs font-semibold tracking-[0.14em] text-ink/60 uppercase">{text}</h3>
{/snippet}

<aside
	class="fixed inset-x-0 bottom-0 z-40 flex max-h-[44dvh] flex-col rounded-t-3xl bg-paper shadow-[0_-16px_40px_-16px_rgba(32,61,50,0.45)] ring-1 ring-ink/10 lg:sticky lg:top-6 lg:z-auto lg:max-h-[min(78dvh,900px)] lg:w-[22rem] lg:shrink-0 lg:rounded-3xl lg:shadow-[0_18px_40px_-24px_rgba(32,61,50,0.45)]"
	aria-labelledby="{uid}-title"
	transition:fly={{ y: 40, duration: 200 }}
>
	<div class="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
		<div class="flex items-baseline gap-3">
			<h2 id="{uid}-title" class="font-serif text-2xl font-semibold">Customize</h2>
			<p
				class="text-xs {status === 'error' ? 'text-red-700' : 'text-ink/55'}"
				role="status"
				aria-live="polite"
			>
				{status === 'saving'
					? 'Saving…'
					: status === 'saved'
						? 'Saved'
						: status === 'error'
							? 'Couldn’t save. Check your connection.'
							: ''}
			</p>
		</div>
		<button
			type="button"
			onclick={onclose}
			aria-label="Close customize panel"
			class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-moss"
			><X size={17} aria-hidden="true" /></button
		>
	</div>

	<div class="px-5">
		<div
			class="grid grid-cols-2 gap-1 rounded-full bg-moss p-1"
			role="radiogroup"
			aria-label="What to customize"
		>
			{#each [['page', 'This page'], ['cover', 'Cover']] as [id, label] (id)}
				<button
					type="button"
					role="radio"
					aria-checked={tab === id}
					onclick={() => ontab(id as 'page' | 'cover')}
					class="rounded-full py-2 text-sm font-medium {tab === id
						? 'bg-ink text-cream'
						: 'text-ink/70'}">{label}</button
				>
			{/each}
		</div>
	</div>

	<div
		class="mt-3 flex-1 overflow-y-auto overscroll-contain px-5 pb-5"
		style="padding-bottom: max(1.25rem, env(safe-area-inset-bottom))"
	>
		{#if tab === 'page'}
			{#if !page || !style || !pal}
				<div class="py-6 text-center">
					<p class="text-sm text-ink/70">
						{pageCount
							? 'Turn to one of your days to decorate its page.'
							: 'Each day you save gets a page you can decorate. Until then, make the cover yours.'}
					</p>
					{#if ongoto}
						<button
							type="button"
							onclick={ongoto}
							class="mt-4 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-cream"
							>Go to my first day</button
						>
					{:else}
						<button
							type="button"
							onclick={() => ontab('cover')}
							class="mt-4 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-cream"
							>Customize the cover</button
						>
					{/if}
				</div>
			{:else}
				<div class="flex items-center justify-between gap-3">
					<p class="min-w-0 truncate text-sm text-ink/70">
						<span class="font-semibold text-ink">Page {page.index}</span> · {page.title}
					</p>
					{#if choices.length > 1}
						<div
							class="flex shrink-0 gap-1 rounded-full bg-moss p-0.5"
							role="radiogroup"
							aria-label="Which page"
						>
							{#each choices as ch (ch.index)}
								<button
									type="button"
									role="radio"
									aria-checked={ch.index === page.index}
									onclick={() => onchoose(ch.index)}
									class="rounded-full px-2.5 py-1 text-xs font-medium {ch.index === page.index
										? 'bg-ink text-cream'
										: 'text-ink/70'}">{ch.side}</button
								>
							{/each}
						</div>
					{/if}
				</div>
				<p class="mt-1 text-xs text-ink/50">
					{custom ? 'This page has its own look.' : 'This page uses your book’s look.'}
					<span class="hidden lg:inline">Click a page in the book to pick it.</span>
				</p>

				<section class="mt-4">
					{@render heading('Looks')}
					<div
						class="-mx-5 flex gap-2.5 overflow-x-auto px-5 pb-1"
						role="radiogroup"
						aria-label="Looks"
					>
						{#each LOOKS as look, i (look.name)}
							{@const lp = pagePalette(look.style)}
							{@const on = sameStyle(style, look.style)}
							<button
								type="button"
								role="radio"
								aria-checked={on}
								onclick={() => onpage({ ...look.style })}
								class="flex shrink-0 flex-col items-center gap-1 rounded-xl p-1 {on
									? 'bg-moss ring-2 ring-ink'
									: 'hover:bg-moss/60'}"
							>
								<svg viewBox="0 0 60 80" class="h-16 w-12 rounded-md shadow-sm" aria-hidden="true">
									<defs>
										<PaperPattern
											id="{uid}-look-{i}"
											kind={look.style.pattern}
											unit={6}
											ink={lp.ink}
											rule={lp.rule}
											accent={lp.pattern}
										/>
										<TapePattern
											id="{uid}-looktape-{i}"
											kind={look.style.tapePattern}
											unit={4}
											base={lp.tape}
											mark={lp.tapeMark}
										/>
									</defs>
									<rect width="60" height="80" fill={lp.paper} />
									<rect width="60" height="80" fill="url(#{uid}-look-{i})" />
									<rect x="8" y="8" width="26" height="3" rx="1.5" fill={lp.ink} opacity="0.7" />
									<rect x="44" y="8" width="8" height="3" rx="1.5" fill={lp.accent} />
									<g transform="rotate(-6 26 40)">
										<rect x="12" y="24" width="28" height="32" fill={lp.frame} />
										<rect x="15" y="27" width="22" height="22" fill={lp.placeholder} />
										<rect
											x="17"
											y="21"
											width="18"
											height="6"
											fill="url(#{uid}-looktape-{i})"
											opacity="0.9"
										/>
									</g>
									<rect x="8" y="64" width="18" height="6" rx="3" fill={lp.accent} />
									<rect x="29" y="64" width="16" height="6" rx="3" fill={lp.ink} />
								</svg>
								<span class="text-[11px] font-medium text-ink/75">{look.name}</span>
							</button>
						{/each}
					</div>
				</section>

				<section class="mt-5">
					{@render heading('Paper')}
					<ColorRow
						label="Paper"
						value={style.paper}
						swatches={SWATCHES.paper}
						onpick={(paper) => onpage({ paper })}
					/>
				</section>

				<section class="mt-5">
					{@render heading('Pattern')}
					<div class="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Paper pattern">
						{#each PAPER_PATTERNS as kind (kind)}
							{@const on = style.pattern === kind}
							<button
								type="button"
								role="radio"
								aria-checked={on}
								onclick={() => onpage({ pattern: kind })}
								class="flex flex-col items-center gap-1 rounded-xl p-1 {on
									? 'bg-moss ring-2 ring-ink'
									: 'hover:bg-moss/60'}"
							>
								<svg
									viewBox="0 0 60 60"
									class="h-12 w-full rounded-md ring-1 ring-ink/10"
									aria-hidden="true"
								>
									<defs>
										<PaperPattern
											id="{uid}-pp-{kind}"
											{kind}
											unit={8}
											ink={pal.ink}
											rule={pal.rule}
											accent={pal.pattern}
										/>
									</defs>
									<rect width="60" height="60" fill={pal.paper} />
									<rect width="60" height="60" fill="url(#{uid}-pp-{kind})" />
								</svg>
								<span class="text-[11px] text-ink/75">{PAPER_NAMES[kind]}</span>
							</button>
						{/each}
					</div>
				</section>

				<section class="mt-5">
					{@render heading('Accent')}
					<ColorRow
						label="Accent"
						value={style.accent}
						swatches={SWATCHES.accent}
						onpick={(accent) => onpage({ accent })}
					/>
					<p class="mt-2 text-xs text-ink/50">
						Date, highlight star, first sticker, and gingham or stripes.
					</p>
				</section>

				<section class="mt-5">
					{@render heading('Washi tape')}
					<ColorRow
						label="Tape"
						value={style.tape}
						swatches={SWATCHES.tape}
						onpick={(tape) => onpage({ tape })}
					/>
					<div class="mt-3 grid grid-cols-4 gap-2" role="radiogroup" aria-label="Tape pattern">
						{#each TAPE_PATTERNS as kind (kind)}
							{@const on = style.tapePattern === kind}
							<button
								type="button"
								role="radio"
								aria-checked={on}
								onclick={() => onpage({ tapePattern: kind })}
								class="flex flex-col items-center gap-1 rounded-xl p-1.5 {on
									? 'bg-moss ring-2 ring-ink'
									: 'hover:bg-moss/60'}"
							>
								<svg viewBox="0 0 64 24" class="h-6 w-full" aria-hidden="true">
									<defs>
										<TapePattern
											id="{uid}-tp-{kind}"
											{kind}
											unit={7}
											base={pal.tape}
											mark={pal.tapeMark}
										/>
									</defs>
									<rect
										x="2"
										y="4"
										width="60"
										height="16"
										fill="url(#{uid}-tp-{kind})"
										transform="rotate(-4 32 12)"
									/>
								</svg>
								<span class="text-[11px] text-ink/75">{TAPE_NAMES[kind]}</span>
							</button>
						{/each}
					</div>
				</section>

				<section class="mt-5">
					{@render heading('Photo frames')}
					<ColorRow
						label="Frames"
						value={style.frame}
						swatches={SWATCHES.frame}
						onpick={(frame) => onpage({ frame })}
					/>
				</section>

				<div class="mt-6 border-t border-ink/10 pt-4">
					{#if confirming}
						<p class="text-sm text-ink/80">
							Give all {pageCount}
							{pageCount === 1 ? 'page' : 'pages'} this look? Pages you decorated separately change too,
							and new days start with it.
						</p>
						<div class="mt-3 flex gap-2">
							<button
								type="button"
								onclick={() => (confirming = false)}
								class="flex-1 rounded-full py-2.5 text-sm font-semibold ring-1 ring-ink/20"
								>Cancel</button
							>
							<button
								type="button"
								onclick={() => {
									confirming = false;
									onapplyall();
								}}
								class="flex-1 rounded-full bg-ink py-2.5 text-sm font-semibold text-cream"
								>Use on every page</button
							>
						</div>
					{:else}
						<div class="grid gap-2">
							<button
								type="button"
								onclick={() => (confirming = true)}
								class="flex items-center justify-center gap-1.5 rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-cream"
								><Layers size={15} aria-hidden="true" />Use this look on every page</button
							>
							<button
								type="button"
								onclick={onreset}
								disabled={!custom}
								class="flex items-center justify-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-semibold ring-1 ring-ink/20 disabled:opacity-40"
								><RotateCcw size={15} aria-hidden="true" />Reset to the book’s look</button
							>
						</div>
					{/if}
				</div>
			{/if}
		{:else}
			<section class="mt-1">
				{@render heading('Cloth')}
				<ColorRow
					label="Cloth"
					value={cover.cloth}
					swatches={SWATCHES.cloth}
					onpick={(cloth) => oncover({ cloth })}
				/>
			</section>

			<section class="mt-5">
				{@render heading('Print')}
				<div class="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Cover print">
					{#each COVER_PATTERNS as kind (kind)}
						{@const on = cover.pattern === kind}
						<button
							type="button"
							role="radio"
							aria-checked={on}
							onclick={() => oncover({ pattern: kind })}
							class="flex flex-col items-center gap-1 rounded-xl p-1 {on
								? 'bg-moss ring-2 ring-ink'
								: 'hover:bg-moss/60'}"
						>
							<svg
								viewBox="150 150 300 400"
								class="h-16 w-12 rounded-md shadow-sm"
								aria-hidden="true"
							>
								<defs>
									<CoverPattern id="{uid}-cp-{kind}" {kind} color={cpal.pattern} bg={cpal.cloth} />
								</defs>
								<rect x="150" y="150" width="300" height="400" fill={cpal.cloth} />
								<rect x="150" y="150" width="300" height="400" fill="url(#{uid}-cp-{kind})" />
								<rect x="400" y="150" width="22" height="400" fill={cpal.band} />
							</svg>
							<span class="text-[11px] text-ink/75">{COVER_NAMES[kind]}</span>
						</button>
					{/each}
				</div>
			</section>

			<section class="mt-5">
				{@render heading('Band')}
				<ColorRow
					label="Band"
					value={cover.band}
					swatches={SWATCHES.band}
					onpick={(band) => oncover({ band })}
				/>
			</section>

			<section class="mt-5">
				<label for="{uid}-cover-title">{@render heading('Title')}</label>
				<input
					id="{uid}-cover-title"
					type="text"
					value={cover.title}
					maxlength={TITLE_MAX}
					placeholder={DEFAULT_COVER.title}
					autocomplete="off"
					oninput={(e) => oncover({ title: e.currentTarget.value })}
					class="w-full rounded-xl bg-white px-4 py-2.5 font-serif text-lg ring-1 ring-ink/15 outline-none focus:ring-2 focus:ring-orange"
				/>
			</section>

			<section class="mt-5">
				{@render heading('Endpapers')}
				<ColorRow
					label="Endpapers"
					value={cover.endpaper}
					swatches={SWATCHES.endpaper}
					onpick={(endpaper) => oncover({ endpaper })}
				/>
				<p class="mt-2 text-xs text-ink/50">The contents page and the last page.</p>
			</section>

			<div class="mt-6 border-t border-ink/10 pt-4">
				<button
					type="button"
					onclick={onresetcover}
					disabled={sameStyle(cover, DEFAULT_COVER)}
					class="flex items-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-semibold ring-1 ring-ink/20 disabled:opacity-40"
					><RotateCcw size={15} aria-hidden="true" />Reset cover</button
				>
			</div>
		{/if}
	</div>
</aside>
