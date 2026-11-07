<script lang="ts">
	/**
	 * This month's backend usage: one hero number with a meter against the monthly allowance, credits by service
	 * as a sorted bar list (directly labelled, so no hover is needed), and the last 30 days as columns with a
	 * hover/focus tooltip and a screen-reader table. 1 credit = $0.001 of estimated upstream cost.
	 */
	import type { UsageSummary } from '#lib/server/account';
	let { usage }: { usage: UsageSummary } = $props();

	const SERVICE: Record<string, string> = {
		gemini: 'Gemini (AI writing & picking)',
		embedding: 'Gemini embeddings',
		nimble: 'Nimble web search',
		places: 'Google Places',
		maps: 'Google Maps',
		geocoding: 'Google Geocoding'
	};
	const fmt = (n: number) =>
		n >= 100 ? Math.round(n).toLocaleString() : n >= 10 ? n.toFixed(1) : n.toFixed(2);
	const share = $derived(Math.min(1, usage.creditsUsed / usage.creditsLimit));
	const level = $derived(share >= 0.95 ? 'danger' : share >= 0.75 ? 'warning' : 'ok');
	const FILL = { ok: '#285c47', warning: '#d96738', danger: '#b42318' } as const;
	const maxService = $derived(Math.max(...usage.byService.map((s) => s.credits), 0.0001));
	const maxDay = $derived(Math.max(...usage.byDay.map((d) => d.credits), 0.0001));
	const month = new Date().toLocaleDateString(undefined, { month: 'long' });
	const resets = $derived(
		new Date(`${usage.resetsOn}T00:00:00Z`).toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			timeZone: 'UTC'
		})
	);
	const dayLabel = (d: string) =>
		new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			timeZone: 'UTC'
		});

	let tip = $state<{ i: number; x: number } | null>(null);
	let strip = $state<HTMLElement>();
	function show(i: number, el: HTMLElement) {
		const box = strip?.getBoundingClientRect();
		const r = el.getBoundingClientRect();
		tip = { i, x: box ? r.left - box.left + r.width / 2 : 0 };
	}
</script>

<div class="space-y-6">
	<div>
		<p class="text-sm text-ink/65">Credits used in {month}</p>
		<p class="mt-1 text-5xl font-semibold tracking-tight">{fmt(usage.creditsUsed)}</p>
		<p class="mt-1 text-sm text-ink/60">
			of {usage.creditsLimit.toLocaleString()} · resets {resets} · about ${usage.costUsd.toFixed(2)} at
			list prices
		</p>
		<div
			class="mt-3 h-2.5 overflow-hidden rounded-full bg-moss"
			role="meter"
			aria-valuemin="0"
			aria-valuemax={usage.creditsLimit}
			aria-valuenow={Math.round(usage.creditsUsed)}
			aria-label="Monthly credits used"
		>
			<div
				class="h-full rounded-full transition-[width]"
				style="width: {Math.max(share * 100, usage.creditsUsed > 0 ? 1.5 : 0)}%; background: {FILL[
					level
				]}"
			></div>
		</div>
		{#if level !== 'ok'}
			<p class="mt-2 text-sm font-medium" style="color: {FILL[level]}">
				{level === 'danger'
					? '⚠ Almost out: new plans pause at the limit until the 1st.'
					: '⚠ Past three quarters of this month’s credits.'}
			</p>
		{/if}
	</div>

	<div>
		<h3 class="text-xs font-semibold tracking-wide text-ink/60 uppercase">
			By service, this month
		</h3>
		{#if usage.byService.length}
			<ul class="mt-3 space-y-3">
				{#each usage.byService as s (s.service)}
					<li>
						<div class="flex items-baseline justify-between gap-3 text-sm">
							<span>{SERVICE[s.service] ?? s.service}</span>
							<span class="tabular-nums"
								><strong>{fmt(s.credits)}</strong>
								<span class="text-ink/50"
									>· {s.calls.toLocaleString()} {s.calls === 1 ? 'call' : 'calls'}</span
								></span
							>
						</div>
						<div class="mt-1 h-2 rounded-r bg-transparent">
							<div
								class="h-full rounded-r-[4px] bg-green"
								style="width: {Math.max(1.5, (s.credits / maxService) * 100)}%"
							></div>
						</div>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="mt-2 text-sm text-ink/55">
				Nothing yet this month. Plan a day and it shows up here.
			</p>
		{/if}
	</div>

	<div>
		<h3 class="text-xs font-semibold tracking-wide text-ink/60 uppercase">
			Credits per day, last 30 days
		</h3>
		<div
			bind:this={strip}
			class="relative mt-3"
			onpointerleave={() => (tip = null)}
			role="presentation"
		>
			<div class="flex h-24 items-end gap-[2px] border-b border-ink/15">
				{#each usage.byDay as d, i (d.day)}
					<button
						type="button"
						class="group flex h-full flex-1 items-end focus:outline-none"
						aria-label="{dayLabel(d.day)}: {fmt(d.credits)} credits"
						onpointerenter={(e) => show(i, e.currentTarget)}
						onfocus={(e) => show(i, e.currentTarget)}
						onblur={() => (tip = null)}
					>
						<span
							class="block w-full max-w-6 rounded-t-[4px] bg-green transition group-hover:bg-[#3f7a5f] group-focus-visible:bg-orange"
							style="height: {d.credits > 0 ? Math.max(4, (d.credits / maxDay) * 100) : 0}%"
						></span>
					</button>
				{/each}
			</div>
			<div class="mt-1 flex justify-between text-[11px] text-ink/50 tabular-nums">
				<span>{dayLabel(usage.byDay[0]?.day ?? usage.resetsOn)}</span><span>Today</span>
			</div>
			{#if tip}
				{@const d = usage.byDay[tip.i]}
				<div
					class="pointer-events-none absolute -top-12 z-10 -translate-x-1/2 rounded-lg bg-ink px-2.5 py-1.5 text-xs whitespace-nowrap text-cream shadow"
					style="left: {tip.x}px"
				>
					<strong>{fmt(d.credits)}</strong> credits · {dayLabel(d.day)}
				</div>
			{/if}
			<table class="sr-only">
				<caption>Credits per day</caption>
				<tbody>
					{#each usage.byDay as d (d.day)}<tr
							><th scope="row">{dayLabel(d.day)}</th><td>{fmt(d.credits)}</td></tr
						>{/each}
				</tbody>
			</table>
		</div>
	</div>
	<p class="text-xs text-ink/50">
		1 credit = $0.001 of estimated cost for the AI, search and map calls made for you, at
		pay-as-you-go list prices. Google’s free monthly allowances usually cover this, so the real bill
		is often lower.
	</p>
</div>
