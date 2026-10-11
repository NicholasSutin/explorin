<script lang="ts">
	/**
	 * Stylized static map served by /api/map (same-origin, key stays on the server).
	 * Renders nothing when there are no coordinates or the map fails, so layouts degrade quietly.
	 */
	import type { LatLng } from '#lib/adventure';
	let {
		coords,
		pins = [],
		zoom = 15,
		w = 600,
		h = 300,
		style = 'paper',
		numbered = false,
		trail = false,
		alt = 'Map',
		class: className = ''
	}: {
		coords?: LatLng;
		pins?: LatLng[];
		zoom?: number;
		w?: number;
		h?: number;
		style?: 'paper' | 'ink' | 'cloud';
		numbered?: boolean;
		trail?: boolean;
		alt?: string;
		class?: string;
	} = $props();
	let failed = $state(false);
	const src = $derived.by(() => {
		const q = new URLSearchParams({ w: String(w), h: String(h), style });
		if (coords) {
			q.set('lat', coords.lat.toFixed(6));
			q.set('lng', coords.lng.toFixed(6));
			q.set('zoom', String(zoom));
		} else if (pins.length) {
			q.set('pins', pins.map((p) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`).join(';'));
			if (numbered) q.set('numbered', '1');
			if (trail) q.set('trail', '1');
		} else return '';
		return `/api/map?${q.toString()}`;
	});
</script>

{#if src && !failed}
	<img
		class="place-map {className}"
		{src}
		{alt}
		width={w}
		height={h}
		loading="lazy"
		decoding="async"
		onerror={() => (failed = true)}
	/>
{/if}
