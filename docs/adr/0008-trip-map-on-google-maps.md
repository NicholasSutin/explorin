# ADR-0008: The trip map is a styled Google map; Places data is kept within Google's terms

**Status:** Accepted
**Date:** 2026-10-17
**Deciders:** Nick Sutin

## Context

The trip screen needs a real, interactive map: stops, landmarks, happenings, the person's live position, and a hand-off to Apple or Google Maps for directions. It should look like Explorin (paper and ink), not like Google Maps.

The stops come from Google Places (place id, coordinates, photos). Google Maps Platform Service Specific Terms §14.2 says Places content must not be used with a non-Google map, and the general terms allow storing place ids indefinitely and coordinates for at most 30 days, while names, photos and reviews may not be stored.

## Decision

- **Google Maps JavaScript API** for the trip map (`src/lib/gmaps.ts`, `TripMap.svelte`), styled with the classic JSON style array (cream paper, moss parks, businesses hidden) and drawn with our own HTML markers on an `OverlayView`. JSON styles only work without a Cloud Map ID, and `AdvancedMarkerElement` needs one, so the overlay keeps the whole look in code and the setup to one referrer-restricted browser key (`GOOGLE_MAPS_BROWSER_KEY`). Google's own landmarks stay visible and tappable; a tap opens our sheet (Place Details Pro) with "Add to my day".
- **No key, or a rejected key, falls back** to a Static Maps snapshot (still a Google map) via `gm_authFailure` and an error-overlay check.
- **Storage rules** (`trips.ts`): a stop stores the Google place id and Explorin's own text (AI title, reason, tags). Coordinates are stored with `coords_at` and refreshed by place id after 25 days through Place Details Essentials (`location,photos`, the cheapest SKU). Photos are fetched by place id every time a trip is shown. Stops added from the map store only the id; their name and address are fetched when shown. Maps links are built from the place id, not stored.
- **The scrapbook's route stamp is a Static Maps image** in the paper style, so Places-derived coordinates stay on a Google map there too. The person's own GPS fix at check-in is their data and is stored as is.
- **Happenings** come from NYC Open Data (permitted events), geocoded with NYC GeoSearch (free) or Google Geocoding for street segments, cached 30 days. They are not Places content.

## Options considered

### Option A: MapLibre with free OpenStreetMap tiles (OpenFreeMap)

| Dimension | Assessment |
|---|---|
| Cost | $0, no key |
| Look | Full control over every layer |
| Data | Cannot show Google Places photos, coordinates or names on it (§14.2) |

Would mean replacing Places as the source of place data (OSM/Overture for coordinates, Wikimedia for photos) and losing Google's verification of AI-picked places.

### Option B: Google Maps JS with a Cloud Map ID and Advanced Markers

**Pros:** vector map, tilt and rotation. **Cons:** the style lives in the Cloud console, not the repo, and one more thing to set up per environment.

### Option C: Google Maps JS, JSON style, OverlayView markers (chosen)

**Pros:** compliant with the Places terms; the look is in code; one key. **Cons:** raster map only; marker DOM is ours to maintain.

## Consequences

- Cost: dynamic map loads are $7 / 1k after 10k free per month and are metered per person (`maps.dynamic_load`). Place Details Essentials refreshes are 10k free per month.
- If Places is ever replaced as the data source, Option A becomes the cheaper choice and `TripMap.svelte` is the only component to swap.
