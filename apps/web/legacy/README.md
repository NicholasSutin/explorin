# Legacy (hackathon flows)

Moved here on the `feat/vision` branch when the app became one sign-in-first flow (onboarding → plan → trip map →
reflect → scrapbook → settings). Nothing in this folder is routed, built, type-checked or tested.

- `routes/+page.svelte`, `routes/explorin.css`: the guest single-page discover → adventure → scrapbook flow
- `routes/(profile)`, `routes/(flow)`: the photo taste profile, `/ask`, `/go`, `/reflect`, `/profile`
- `routes/api/*`, `lib/server/*`: their endpoints and server modules (recommend, personas, photo profile, reflect)
- `tests/adventure.spec.ts`: the guest demo end-to-end test

Delete the folder once the new flow has replaced everything you want from it.
