<script lang="ts">
	/** The classic tier list: one row per grade with the graded cards as thumbnails. Tap one to re-grade it. */
	import { CATEGORY, GRADES, categoryImage, type Grades } from '#lib/taste';
	let {
		grades,
		onpick,
		compact = false
	}: { grades: Grades; onpick?: (id: string) => void; compact?: boolean } = $props();
	const ROW: Record<string, string> = {
		'S+': 'bg-orange text-white',
		'A+': 'bg-green text-cream',
		A: 'bg-[#5f8a6e] text-cream',
		B: 'bg-[#a9bf9c] text-ink',
		C: 'bg-[#d8d3c2] text-ink',
		NO: 'bg-ink text-cream'
	};
	const byGrade = $derived(
		GRADES.map((g) => ({ g, ids: Object.keys(grades).filter((id) => grades[id] === g) }))
	);
</script>

<div class="overflow-hidden rounded-2xl ring-1 ring-ink/10" role="list" aria-label="Your tier list">
	{#each byGrade as row (row.g)}
		<div
			class="flex min-h-14 items-stretch border-b border-ink/10 bg-paper last:border-b-0"
			role="listitem"
		>
			<div
				class="flex w-12 shrink-0 items-center justify-center font-serif text-lg font-bold {ROW[
					row.g
				]}"
			>
				{row.g}
			</div>
			<div class="flex flex-1 flex-wrap items-center gap-1.5 p-1.5">
				{#each row.ids as id (id)}
					{@const c = CATEGORY.get(id)}
					{#if c}
						<button
							type="button"
							disabled={!onpick}
							onclick={() => onpick?.(id)}
							title={c.name}
							aria-label="{c.name}, graded {row.g}{onpick ? '. Change grade' : ''}"
							class="group relative overflow-hidden rounded-lg bg-moss {compact
								? 'h-10 w-10'
								: 'h-14 w-14'}"
						>
							<img
								src={categoryImage(id)}
								alt=""
								class="h-full w-full object-cover"
								loading="lazy"
							/>
							{#if !compact}<span
									class="absolute inset-x-0 bottom-0 truncate bg-ink/70 px-0.5 text-[9px] leading-tight text-cream"
									>{c.name}</span
								>{/if}
						</button>
					{/if}
				{:else}
					<span class="px-2 text-xs text-ink/35">—</span>
				{/each}
			</div>
		</div>
	{/each}
</div>
