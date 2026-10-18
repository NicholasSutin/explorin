// A stand-in for the slice of the Maps JavaScript API the trip map uses (Map, OverlayView, LatLng, LatLngBounds,
// Polyline, Circle). Loaded with page.addInitScript so the journey test exercises TripMap's markers, trail and
// selection without a browser key or a billed map load. Positions use a flat projection around the centre.
(() => {
	class LatLng {
		constructor(a, b) {
			const p = typeof a === 'object' ? a : { lat: a, lng: b };
			this._lat = p.lat;
			this._lng = p.lng;
		}
		lat() {
			return this._lat;
		}
		lng() {
			return this._lng;
		}
		toJSON() {
			return { lat: this._lat, lng: this._lng };
		}
	}
	class LatLngBounds {
		constructor() {
			this.points = [];
		}
		extend(p) {
			this.points.push(p);
			return this;
		}
	}
	class MapsObject {
		setMap(map) {
			this.map = map;
		}
		setCenter() {}
		setRadius() {}
	}
	class GMap {
		constructor(el, opts) {
			this.el = el;
			this.center = opts.center;
			this.zoom = opts.zoom ?? 14;
			this.listeners = {};
			el.style.position = 'relative';
			el.style.background = '#f3f0e3';
			this.__pane = document.createElement('div');
			this.__pane.className = 'fake-map-pane';
			this.__pane.style.cssText = 'position:absolute;inset:0;overflow:hidden';
			el.appendChild(this.__pane);
			window.__fakeMap = this;
		}
		__project(ll) {
			const p = ll.toJSON ? ll.toJSON() : ll;
			return {
				x: (p.lng - this.center.lng) * 40000 + this.el.clientWidth / 2,
				y: (this.center.lat - p.lat) * 52000 + this.el.clientHeight / 2
			};
		}
		addListener(name, fn) {
			(this.listeners[name] ??= []).push(fn);
			return { remove() {} };
		}
		setOptions() {}
		setCenter(c) {
			this.center = c;
		}
		panTo(c) {
			this.center = c;
		}
		panBy() {}
		fitBounds(b) {
			const pts = b.points;
			this.center = {
				lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length,
				lng: pts.reduce((s, p) => s + p.lng, 0) / pts.length
			};
		}
		getZoom() {
			return this.zoom;
		}
	}
	class OverlayView {
		setMap(map) {
			if (map) {
				this.__map = map;
				this.onAdd?.();
				this.draw?.();
			} else if (this.__map) {
				this.onRemove?.();
				this.__map = null;
			}
		}
		getPanes() {
			return { overlayMouseTarget: this.__map.__pane };
		}
		getProjection() {
			const map = this.__map;
			return { fromLatLngToDivPixel: (ll) => map.__project(ll) };
		}
		static preventMapHitsAndGesturesFrom() {}
	}
	window.google = {
		maps: {
			Map: GMap,
			OverlayView,
			LatLng,
			LatLngBounds,
			Polyline: class extends MapsObject {
				constructor(o) {
					super();
					this.map = o.map;
					window.__fakeTrail = o.path;
				}
			},
			Circle: class extends MapsObject {},
			ControlPosition: { RIGHT_CENTER: 0 }
		}
	};
})();
