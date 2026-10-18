/**
 * Browser side of the interactive trip map: Google Maps JavaScript API loader, the brand "paper" style and an
 * HTML marker. Google's Places terms require Places content to sit on a Google map (Service Specific Terms
 * §14.2), so the trip map is Google's, styled to look like Explorin's field notes rather than Google Maps.
 *
 * Styling uses the classic JSON style array, which only applies without a Cloud Map ID; markers are therefore
 * an OverlayView with our own DOM instead of AdvancedMarkerElement (which needs a Map ID). That keeps the whole
 * look in code and the setup to a single browser key.
 */

let loading: Promise<typeof google.maps> | null = null;
const authFailures = new Set<() => void>();

/**
 * Called when Google rejects the key (not enabled for the Maps JavaScript API, wrong referrer, billing off).
 * Google then paints its own error screen over the map, so callers swap in a fallback instead.
 * https://developers.google.com/maps/documentation/javascript/events#auth-errors
 */
export function onMapsAuthFailure(fn: () => void): () => void {
	authFailures.add(fn);
	return () => authFailures.delete(fn);
}

/** Load the Maps JavaScript API once per page. */
export function loadGoogleMaps(key: string): Promise<typeof google.maps> {
	if (typeof window === 'undefined')
		return Promise.reject(new Error('Maps load in the browser only'));
	if (window.google?.maps?.Map) return Promise.resolve(window.google.maps);
	(window as unknown as { gm_authFailure?: () => void }).gm_authFailure = () => {
		for (const fn of authFailures) fn();
	};
	loading ??= new Promise((resolve, reject) => {
		const cb = `__explorinMaps${Math.random().toString(36).slice(2)}`;
		(window as unknown as Record<string, () => void>)[cb] = () => resolve(window.google.maps);
		const s = document.createElement('script');
		s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async&callback=${cb}`;
		s.async = true;
		s.onerror = () => {
			loading = null;
			reject(new Error('Could not load the map.'));
		};
		document.head.appendChild(s);
	});
	return loading;
}

/** Cream paper, moss parks, muted water, quiet roads; businesses hidden so landmarks and our pins stand out. */
export function paperStyle(landmarks: boolean): google.maps.MapTypeStyle[] {
	return [
		{ elementType: 'geometry', stylers: [{ color: '#f3f0e3' }] },
		{ elementType: 'labels.text.fill', stylers: [{ color: '#40564a' }] },
		{ elementType: 'labels.text.stroke', stylers: [{ color: '#f8f6ef' }, { weight: 3 }] },
		{
			featureType: 'administrative',
			elementType: 'geometry.stroke',
			stylers: [{ color: '#cfd6c6' }]
		},
		{ featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
		{
			featureType: 'administrative.neighborhood',
			elementType: 'labels.text.fill',
			stylers: [{ color: '#7a8a7d' }]
		},
		{ featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#efebdc' }] },
		{ featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#eaeadb' }] },
		{ featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#e6e9d8' }] },
		{ featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#d3e0c0' }] },
		{ featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#4f6f52' }] },
		{ featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
		{ featureType: 'poi.medical', stylers: [{ visibility: 'off' }] },
		{ featureType: 'poi.school', stylers: [{ visibility: 'off' }] },
		{ featureType: 'poi.government', stylers: [{ visibility: 'off' }] },
		{ featureType: 'poi.sports_complex', stylers: [{ visibility: 'off' }] },
		{
			featureType: 'poi',
			elementType: 'labels.icon',
			stylers: [{ saturation: -55 }, { lightness: 10 }]
		},
		...(landmarks
			? []
			: [{ featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] }]),
		{ featureType: 'road', elementType: 'geometry.fill', stylers: [{ color: '#ffffff' }] },
		{ featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#e2dfcf' }] },
		{ featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
		{ featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#7d877a' }] },
		{ featureType: 'road.highway', elementType: 'geometry.fill', stylers: [{ color: '#f2e6c9' }] },
		{
			featureType: 'road.highway',
			elementType: 'geometry.stroke',
			stylers: [{ color: '#dfd1aa' }]
		},
		{ featureType: 'transit', elementType: 'labels.icon', stylers: [{ saturation: -60 }] },
		{ featureType: 'transit.line', elementType: 'geometry', stylers: [{ color: '#d6d0bd' }] },
		{ featureType: 'water', elementType: 'geometry', stylers: [{ color: '#bfd4cf' }] },
		{ featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#5f7a74' }] }
	];
}

export interface HtmlMarker extends google.maps.OverlayView {
	setPosition(pos: google.maps.LatLngLiteral): void;
	element: HTMLElement;
}

/**
 * A DOM element pinned to a coordinate. The element's own CSS decides its anchor (translate) and look.
 * Gestures on it don't pan the map, and clicks reach the element's own listeners. `ondraw` runs after each
 * reposition (on add and on zoom), for layout passes that need every marker's pixel position.
 */
export function htmlMarker(
	g: typeof google.maps,
	map: google.maps.Map,
	pos: google.maps.LatLngLiteral,
	element: HTMLElement,
	ondraw?: () => void
): HtmlMarker {
	class Marker extends g.OverlayView {
		element = element;
		private at: google.maps.LatLng;
		constructor() {
			super();
			this.at = new g.LatLng(pos);
			element.style.position = 'absolute';
		}
		onAdd() {
			this.getPanes()!.overlayMouseTarget.appendChild(element);
			g.OverlayView.preventMapHitsAndGesturesFrom(element);
		}
		draw() {
			const p = this.getProjection()?.fromLatLngToDivPixel(this.at);
			if (!p) return;
			element.style.left = `${p.x}px`;
			element.style.top = `${p.y}px`;
			ondraw?.();
		}
		onRemove() {
			element.remove();
		}
		setPosition(next: google.maps.LatLngLiteral) {
			this.at = new g.LatLng(next);
			this.draw();
		}
	}
	const m = new Marker();
	m.setMap(map);
	return m;
}
