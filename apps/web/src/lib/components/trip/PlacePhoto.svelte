<script lang="ts">
	/** A Google place photo through /api/photo, with the contributor credit Google's policy requires. */
	import type { ExperiencePhoto } from '#lib/adventure';
	let {
		photo,
		alt = '',
		class: className = '',
		credit = true,
		eager = false
	}: {
		photo?: ExperiencePhoto;
		alt?: string;
		class?: string;
		credit?: boolean;
		eager?: boolean;
	} = $props();
	let failed = $state(false);
</script>

{#if photo && !failed}
	<figure class="relative overflow-hidden bg-moss {className}">
		<img
			src="/api/photo?name={encodeURIComponent(photo.name)}"
			{alt}
			loading={eager ? 'eager' : 'lazy'}
			class="h-full w-full object-cover"
			onerror={() => (failed = true)}
		/>
		{#if credit}
			<figcaption
				class="absolute right-1.5 bottom-1.5 max-w-[80%] truncate rounded bg-ink/60 px-1.5 py-0.5 text-[10px] text-cream"
			>
				Photo: {#if photo.attributionUrl}<a
						href={photo.attributionUrl}
						target="_blank"
						rel="noopener noreferrer"
						class="underline">{photo.attribution}</a
					>{:else}{photo.attribution}{/if}
			</figcaption>
		{/if}
	</figure>
{/if}
