<script lang="ts">
	/**
	 * The interactive trip map (Google Maps JS, paper style). Draws: numbered stop pins (labels appear at street
	 * zoom or when selected, so the city view stays calm), happenings, the dashed walking trail through the day,
	 * the person's live position with its accuracy ring, and Google's own landmarks, which are tappable.
	 */
	import { onMount } from 'svelte';
	import type { Happening, Stop } from '#lib/adventure';
	import type { Fix } from '#lib/client';
	import {
		htmlMarker,
		loadGoogleMaps,
		onMapsAuthFailure,
		paperStyle,
		type HtmlMarker
	} from '#lib/gmaps';
	import { samePick, type Selection } from '#lib/trip-ui';

	let {
		apiKey,
		stops,
		happenings,
		fix,
		selected,
		showHappenings = true,
		showLandmarks = true,
		follow = false,
		inset = { bottom: 0, left: 0 },
		onselect,
		onfollowchange,
		onerror
	}: {
		apiKey: string;
		stops: Stop[];
		happenings: Happening[];
		fix: Fix | null;
		selected: Selection | null;
		showHappenings?: boolean;
		showLandmarks?: boolean;
		follow?: boolean;
		/** Pixels covered by the sheet or side panel, so fitting and panning keep pins visible. */
		inset?: { bottom: number; left: number };
		onselect: (s: Selection | null) => void;
		onfollowchange: (on: boolean) => void;
		onerror: (message: string) => void;
	} = $props();

	let container: HTMLDivElement;
	let g: typeof google.maps | undefined;
	let map = $state<google.maps.Map>();
	let zoom = $state(14);
	let stopMarkers: HtmlMarker[] = [];
	let happeningMarkers: HtmlMarker[] = [];
	let me: HtmlMarker | undefined;
	let ring: google.maps.Circle | undefined;
	let trail: google.maps.Polyline | undefined;
	let fitted = false;

	const NYC = { lat: 40.7359, lng: -73.9911 };
	const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
	const overlaps = (a: DOMRect, b: DOMRect) =>
		a.left < b.right + 2 && b.left < a.right + 2 && a.top < b.bottom + 2 && b.top < a.bottom + 2;

	/**
	 * Keeps the map readable at any zoom: stops that land on one spot (two places in the same building) stack
	 * into a short column instead of hiding each other, a label that would run off the right edge flips to the
	 * pin's left, and a label that would cover another pin or label is dropped. The selected stop's label always
	 * shows; otherwise earlier stops win.
	 */
	function declutter() {
		const els = stopMarkers.map((m) => m.element);
		const anchors: { x: number; y: number; n: number }[] = [];
		for (const el of els) {
			el.classList.remove('is-crowded', 'is-flipped');
			const x = parseFloat(el.style.left);
			const y = parseFloat(el.style.top);
			const near = anchors.find((a) => Math.hypot(a.x - x, a.y - y) < 30);
			if (near) {
				near.n++;
				el.style.setProperty('--dx', `${near.x - x}px`);
				el.style.setProperty('--dy', `${near.y - y + near.n * 38}px`);
			} else {
				if (!isNaN(x) && !isNaN(y)) anchors.push({ x, y, n: 0 });
				el.style.removeProperty('--dx');
				el.style.removeProperty('--dy');
			}
		}
		const taken = [...els, ...happeningMarkers.map((m) => m.element)].map((el) =>
			el.firstElementChild!.getBoundingClientRect()
		);
		const selectedFirst = [...els].sort(
			(a, b) => +b.classList.contains('is-selected') - +a.classList.contains('is-selected')
		);
		const edge = container.getBoundingClientRect().right - 8;
		for (const el of selectedFirst) {
			const labelEl = el.querySelector('.xm-label')!;
			let label = labelEl.getBoundingClientRect();
			if (!label.width) continue;
			if (label.right > edge) {
				el.classList.add('is-flipped');
				label = labelEl.getBoundingClientRect();
			}
			if (!el.classList.contains('is-selected') && taken.some((r) => overlaps(r, label)))
				el.classList.add('is-crowded');
			else taken.push(label);
		}
	}
	let declutterQueued = false;
	function queueDeclutter() {
		if (declutterQueued) return;
		declutterQueued = true;
		requestAnimationFrame(() => {
			declutterQueued = false;
			declutter();
		});
	}

	onMount(() => {
		let gone = false;
		const failed = () =>
			onerror(
				'The interactive map couldn’t load (the Maps key isn’t set up for it yet), so here’s a snapshot of your stops.'
			);
		const off = onMapsAuthFailure(failed);
		// Some key problems only show as Google's error overlay; look for it once the map has had a moment.
		const check = setTimeout(() => container?.querySelector('.gm-err-container') && failed(), 4000);
		loadGoogleMaps(apiKey)
			.then((maps) => {
				if (gone) return;
				g = maps;
				const first = stops.find((s) => s.coords)?.coords ?? fix ?? NYC;
				const m = new maps.Map(container, {
					center: first,
					zoom: 14,
					styles: paperStyle(showLandmarks),
					disableDefaultUI: true,
					zoomControl: true,
					zoomControlOptions: { position: maps.ControlPosition.RIGHT_CENTER },
					gestureHandling: 'greedy',
					clickableIcons: true,
					backgroundColor: '#f3f0e3'
				});
				m.addListener('click', (e: google.maps.MapMouseEvent | google.maps.IconMouseEvent) => {
					if ('placeId' in e && e.placeId && e.latLng) {
						e.stop(); // our sheet instead of Google's info window
						onselect({ kind: 'landmark', placeId: e.placeId, at: e.latLng.toJSON() });
					} else onselect(null);
				});
				m.addListener('dragstart', () => onfollowchange(false));
				m.addListener('zoom_changed', () => (zoom = m.getZoom() ?? 14));
				map = m;
			})
			.catch((e: Error) => onerror(e.message));
		return () => {
			gone = true;
			off();
			clearTimeout(check);
		};
	});

	// Landmarks layer: Google's POI labels on or off.
	$effect(() => {
		map?.setOptions({ styles: paperStyle(showLandmarks) });
	});

	// Stops and the walking trail.
	$effect(() => {
		if (!map || !g) return;
		for (const m of stopMarkers) m.setMap(null);
		stopMarkers = [];
		let n = 0;
		const path: google.maps.LatLngLiteral[] = [];
		for (const s of stops) {
			if (!s.coords) continue;
			const number = s.inPlan ? ++n : null;
			if (s.inPlan) path.push(s.coords);
			const el = document.createElement('button');
			el.type = 'button';
			el.className = `xm-stop${s.visitedAt ? ' is-visited' : ''}${s.inPlan ? '' : ' is-off'}`;
			el.dataset.id = s.id;
			el.setAttribute('aria-label', `${number ? `Stop ${number}: ` : ''}${s.place}`);
			el.innerHTML = `<span class="xm-pin">${s.visitedAt ? '✓' : (number ?? '+')}</span><span class="xm-label">${esc(s.place)}${s.tags[0] ? `<em> · ${esc(s.tags[0])}</em>` : ''}</span>`;
			el.addEventListener('click', (e) => {
				e.stopPropagation();
				onselect({ kind: 'stop', id: s.id });
			});
			stopMarkers.push(htmlMarker(g, map, s.coords, el, queueDeclutter));
		}
		trail?.setMap(null);
		trail = new g.Polyline({
			map,
			path,
			strokeOpacity: 0,
			zIndex: 1,
			icons: [
				{
					icon: {
						path: 'M 0,-1 0,1',
						strokeOpacity: 0.9,
						strokeColor: '#d96738',
						strokeWeight: 3,
						scale: 3
					},
					offset: '0',
					repeat: '14px'
				}
			]
		});
		if (!fitted && path.length) {
			fitted = true;
			const b = new g.LatLngBounds();
			for (const p of path) b.extend(p);
			if (path.length === 1) map.setCenter(path[0]);
			else
				map.fitBounds(b, { top: 70, right: 40, bottom: 40 + inset.bottom, left: 40 + inset.left });
		}
	});

	// Happenings.
	$effect(() => {
		if (!map || !g) return;
		for (const m of happeningMarkers) m.setMap(null);
		happeningMarkers = [];
		if (!showHappenings) return;
		for (const h of happenings) {
			const el = document.createElement('button');
			el.type = 'button';
			el.className = 'xm-happening';
			el.dataset.id = h.id;
			el.setAttribute('aria-label', `Happening: ${h.name}`);
			el.innerHTML = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2v4M16 2v4"/><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18"/><path d="m9 16 2 2 4-4"/></svg><span class="xm-label">${esc(h.name)}</span>`;
			el.addEventListener('click', (e) => {
				e.stopPropagation();
				onselect({ kind: 'happening', id: h.id });
			});
			happeningMarkers.push(htmlMarker(g, map, { lat: h.lat, lng: h.lng }, el, queueDeclutter));
		}
	});

	// Selection highlight and pan.
	$effect(() => {
		if (!map) return;
		const sel = selected;
		for (const m of [...stopMarkers, ...happeningMarkers]) {
			const kind = m.element.classList.contains('xm-stop') ? 'stop' : 'happening';
			const on = samePick(sel, { kind, id: m.element.dataset.id ?? '' } as Selection);
			m.element.classList.toggle('is-selected', on);
		}
		queueDeclutter();
		let at: google.maps.LatLngLiteral | undefined;
		if (sel?.kind === 'stop') at = stops.find((s) => s.id === sel.id)?.coords;
		else if (sel?.kind === 'happening') {
			const h = happenings.find((x) => x.id === sel.id);
			if (h) at = { lat: h.lat, lng: h.lng };
		} else if (sel?.kind === 'landmark') at = sel.at;
		if (at) {
			map.panTo(at);
			map.panBy(-inset.left / 2, inset.bottom / 2);
		}
	});

	// Live position.
	$effect(() => {
		if (!map || !g) return;
		if (!fix) {
			me?.setMap(null);
			ring?.setMap(null);
			me = undefined;
			ring = undefined;
			return;
		}
		const at = { lat: fix.lat, lng: fix.lng };
		if (!me) {
			const el = document.createElement('div');
			el.className = 'xm-me';
			el.setAttribute('aria-label', 'You are here');
			el.innerHTML = '<span></span>';
			me = htmlMarker(g, map, at, el);
			ring = new g.Circle({
				map,
				center: at,
				radius: fix.accuracy,
				strokeOpacity: 0,
				fillColor: '#3b82f6',
				fillOpacity: 0.12,
				clickable: false,
				zIndex: 0
			});
		} else {
			me.setPosition(at);
			ring?.setCenter(at);
			ring?.setRadius(Math.min(fix.accuracy, 500));
		}
		if (follow) map.panTo(at);
	});
</script>

<div bind:this={container} class="h-full w-full" data-zoom={zoom >= 15 ? 'street' : 'city'}></div>

<style>
	/* The pin (not the whole button) sits on the coordinate and the label hangs to its right. --dx/--dy are
	   declutter()'s offsets for stacked pins. */
	div :global(.xm-stop) {
		transform: translate(calc(-16px + var(--dx, 0px)), calc(-16px + var(--dy, 0px)));
		display: flex;
		align-items: center;
		gap: 6px;
		border: 0;
		background: none;
		padding: 0;
		cursor: pointer;
		z-index: 2;
	}
	div :global(.xm-stop .xm-pin) {
		display: flex;
		height: 32px;
		width: 32px;
		align-items: center;
		justify-content: center;
		border-radius: 9999px;
		background: #203d32;
		color: #f8f6ef;
		font:
			700 14px/1 ui-sans-serif,
			system-ui,
			sans-serif;
		box-shadow:
			0 0 0 3px #fbf8ef,
			0 6px 14px -4px rgba(32, 61, 50, 0.55);
		transition: transform 0.15s;
	}
	div :global(.xm-stop.is-visited .xm-pin) {
		background: #285c47;
	}
	div :global(.xm-stop.is-off) {
		transform: translate(calc(-12px + var(--dx, 0px)), calc(-12px + var(--dy, 0px)));
	}
	div :global(.xm-stop.is-flipped) {
		flex-direction: row-reverse;
		transform: translate(calc(16px - 100% + var(--dx, 0px)), calc(-16px + var(--dy, 0px)));
	}
	div :global(.xm-stop.is-off.is-flipped) {
		transform: translate(calc(12px - 100% + var(--dx, 0px)), calc(-12px + var(--dy, 0px)));
	}
	div :global(.xm-stop.is-off .xm-pin) {
		height: 24px;
		width: 24px;
		background: #fbf8ef;
		color: #203d32;
		box-shadow:
			0 0 0 2px rgba(32, 61, 50, 0.35),
			0 3px 8px -3px rgba(32, 61, 50, 0.4);
	}
	div :global(.xm-stop.is-selected) {
		z-index: 5;
	}
	div :global(.xm-stop.is-selected .xm-pin) {
		background: #d96738;
		color: #fff;
		transform: scale(1.18);
	}
	div :global(.xm-label em) {
		font-style: normal;
		font-weight: 500;
		color: #b4552e;
	}
	div :global(.xm-label) {
		display: none;
		max-width: 220px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		border-radius: 9999px;
		background: rgba(251, 248, 239, 0.95);
		padding: 3px 9px;
		color: #203d32;
		font:
			600 12px/1.3 ui-sans-serif,
			system-ui,
			sans-serif;
		box-shadow: 0 2px 6px -2px rgba(32, 61, 50, 0.35);
	}
	div[data-zoom='street'] :global(.xm-stop:not(.is-off) .xm-label),
	div :global(.is-selected .xm-label) {
		display: block;
	}
	div[data-zoom] :global(.xm-stop.is-crowded:not(.is-selected) .xm-label) {
		display: none;
	}
	div :global(.xm-happening) {
		transform: translate(-12.5px, -12.5px);
		display: flex;
		align-items: center;
		gap: 6px;
		border: 0;
		padding: 0;
		background: none;
		cursor: pointer;
		z-index: 1;
	}
	div :global(.xm-happening svg) {
		box-sizing: content-box;
		padding: 5px;
		border-radius: 8px;
		background: #fbf8ef;
		color: #d96738;
		box-shadow:
			0 0 0 2px #d96738,
			0 4px 10px -4px rgba(217, 103, 56, 0.6);
	}
	div :global(.xm-happening.is-selected) {
		z-index: 5;
	}
	div :global(.xm-happening.is-selected svg) {
		background: #d96738;
		color: #fff;
	}
	/* Under the pins: standing at a stop, its number stays readable with the pulse around it. */
	div :global(.xm-me) {
		transform: translate(-50%, -50%);
		z-index: 1;
		pointer-events: none;
	}
	div :global(.xm-me span) {
		display: block;
		height: 16px;
		width: 16px;
		border-radius: 9999px;
		background: #3b82f6;
		box-shadow:
			0 0 0 3px #fff,
			0 0 0 9px rgba(59, 130, 246, 0.18);
		animation: xm-pulse 2.4s ease-out infinite;
	}
	@keyframes -global-xm-pulse {
		0% {
			box-shadow:
				0 0 0 3px #fff,
				0 0 0 0 rgba(59, 130, 246, 0.35);
		}
		100% {
			box-shadow:
				0 0 0 3px #fff,
				0 0 0 16px rgba(59, 130, 246, 0);
		}
	}
</style>
