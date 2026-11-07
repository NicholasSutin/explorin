# Explorin v1: behaviour, limits and costs

What the app does today, where it stops, and what each piece costs. Setup is in [README.md](README.md).

## The flow

1. **Sign up** with an emailed link (Turnstile-gated), then choose a password. Everything except `/welcome` and the account pages needs an account.
2. **About you**: name, home city, a sentence or two about what you like to explore, interests (12 chips), who you usually plan for (teens, families, young adults, 35–60s, older adults).
3. **Tier list**: about ten photo cards chosen for you from a 31-card catalog, graded S+, A+, A, B, C or NO one at a time (keys 1–6 work). The board below is the tier list; tap a card to re-grade. Grade at least five to continue; "Grade 6 more" asks for the next most useful cards.
4. **Plan**: describe the day, pick the time window, optionally start near you. Starters follow your top grades. The pipeline streams as it runs and lands on the trip.
5. **Trip**: the map shows numbered stops, the walking trail, happenings and Google's landmarks (tap one to add it). Each stop opens with a photo, why it fits you, quotes from people like you, Google reviews on request, and Apple Maps / Google Maps buttons (Apple first on Apple devices; transit when a stop is over ~2 km). With location on, the map follows you and offers to check you in within 70 m of a stop.
6. **Reflect**: a short note (dictation where the browser supports it), up to four photos, the highlight. Gemini drafts a title, a story, emotions and six "best for" tags; keep up to three.
7. **Scrapbook**: every finished day is a page in a cloth-bound book. Page turns animate unless turned off in Settings or by reduced-motion. Share a page as a Story (9:16), Post (4:5) or Page (3:4) image; on iPhone the share sheet offers Instagram, Save Image and Save to Files.
8. **Settings**: profile, what you like, re-grade, page-flip animations, usage this month, password, sign out, delete everything.

## Limits

- **Cities**: planning works anywhere Nimble and Places cover; happenings are New York only (NYC Open Data). Without live search, plans outside NYC fail with a clear message; NYC falls back to curated places.
- **Location** is only followed while the trip page is open; iOS pauses it while another app (such as Apple Maps) is in front, and the watch restarts when you come back.
- **Map**: needs `GOOGLE_MAPS_BROWSER_KEY` with the Maps JavaScript API enabled; otherwise a static snapshot. The map is Google's (required for Places content), styled to the brand.
- **Happenings** are permitted events (markets, festivals, parades, plaza events), filtered for public ones. Times come from permits and can change.
- **Photos** are re-encoded in the browser (EXIF and GPS removed), stored under your account and served only to you. Up to four per day.
- **Sharing** uses the Web Share API with files where supported (iOS Safari, Android Chrome); elsewhere the image downloads.
- **Credits**: each person gets `MONTHLY_CREDITS` (default 2000 = $2 at list prices) per calendar month; planning stops at the cap until the 1st.
- **Deletion** removes the account, taste, trips, photos, shared quotes and usage history immediately.

## Costs (list prices after free monthly allowances)

| Call                     | When                                           | Price                                       |
| ------------------------ | ---------------------------------------------- | ------------------------------------------- |
| Nimble search            | 2 per plan                                     | plan-dependent (estimated $0.003)           |
| Gemini Flash             | tier-list narrowing, plan pick, keepsake draft | ~$0.30 / 1M input, $2.50 / 1M output tokens |
| Gemini embeddings        | taste save, plan, keepsake                     | ~$0.15 / 1M tokens                          |
| Places Text Search Pro   | 1 per planned stop                             | $32 / 1k after 5k free                      |
| Place Details Essentials | trip and scrapbook refresh by place id         | $5 / 1k after 10k free                      |
| Place Details Pro        | landmark tapped on the map                     | $17 / 1k after 5k free                      |
| Place Details reviews    | "Google reviews" opened                        | $25 / 1k after 1k free                      |
| Place photo              | each stop photo shown                          | $7 / 1k after 1k free                       |
| Maps JavaScript API      | each trip map load                             | $7 / 1k after 10k free                      |
| Static Maps              | scrapbook stamp, fallback map                  | $2 / 1k after 10k free                      |
| Geocoding                | NYC street-segment events (cached 30 days)     | $5 / 1k after 10k free                      |
| NYC Open Data, GeoSearch | happenings                                     | free                                        |

Prices are in `src/lib/server/pricing.ts`, the single place to update them.
