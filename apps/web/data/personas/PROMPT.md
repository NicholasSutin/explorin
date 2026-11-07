# Agent prompt: build a personal seed persona

Give this to an AI agent that can see your personal data (photos, Strava, calendar, Maps saved places, notes, posts).
Save its output as `data/personas/<id>.json` (gitignored), then run `npm run db:seed-persona -- data/personas/<id>.json`.
The shape matches what onboarding asks for, so the seeded quotes are weighted exactly like a real member's.

Replace `Nick` with the person's first name before sending.

---

```text
You are building a seed profile for Nick for an app called Explorin, which plans days out in New York City from real places and shows how similar people felt there.

Gather evidence about Nick as an explorer from the sources you can access: photos and captions, Strava or fitness logs, calendar events, Google Maps saved places and timeline, notes, journal entries, and social posts. Use only what is clearly supported. Never infer or include health conditions, religion, ethnicity, sexuality, politics, income, or anyone else's private details. Use first names only.

Return ONE JSON object with exactly this shape and nothing else:

{
  "name": "Nick",
  "blurb": "Two or three sentences in Nick's own first-person voice about what he likes to explore. Under 600 characters.",
  "interests": ["Nature", "Coffee & sweets"],
  "audience": ["Young adults"],
  "grades": { "urban-parks": "S+", "coffee-shops": "A", "lively-areas": "NO" },
  "reflections": [
    {
      "place": "Exact place name in New York City",
      "text": "2 to 4 sentences in Nick's own first-person voice about how being there felt. Feelings, not logistics.",
      "quote": "The single most quotable sentence from text, under 30 words.",
      "emotions": ["awe", "calm"],
      "themes": ["sunrise", "skyline"],
      "new_place": null
    }
  ]
}

Rules:
- interests: 2 to 6 of exactly these: Nature, Art & culture, Food & drink, Coffee & sweets, History, Architecture, Nightlife, Shopping, Hidden gems, Slow moments, Something active, Photography.
- audience: who Nick usually goes out with, from exactly these: Teens, Families with kids, Young adults, 35–60s, Older adults. Empty if unclear.
- grades: 6 to 15 entries, each one of S+, A+, A, B, C, NO (S+ love, NO avoid), only where the evidence says so. Keys must be these ids: urban-parks, nature-hikes, city-walks, high-up, restaurants, small-bites, pastries, coffee-shops, fast-food, museums, famous-attractions, street-performers, hosted-tours, shopping, clothes-shopping, gift-shopping, cheap, upscale, fast-paced, slow-relaxing, quiet-areas, lively-areas (always something going on), niche, hidden-gems, underrated, world-famous, social-media-worthy, group-activities, couples-activities, solo-dates, solo-activities.
- 4 to 8 reflections, each tied to a specific real NYC place Nick has actually been. Prefer these names when they fit, spelled exactly: Gantry Plaza State Park, Hunters Point South Park, Central Park Reservoir, Brooklyn Bridge Park, Washington Street, DUMBO, Domino Park, Roosevelt Island, Hudson River Greenway, Fort Tilden, Coney Island Boardwalk, Rockaway Beach Boardwalk, The High Line, Little Island, East River Esplanade.
- For any other place, fill new_place as { "kind": "run_route | viewpoint | park | walk | food", "lat": 0.0, "lng": 0.0, "tags": ["water_view", "skyline", "quiet"], "notes": "one honest line about what it offers" } with accurate coordinates.
- emotions must come only from: awe, calm, nostalgia, pride, joy, belonging, gratitude, exhilaration, curiosity, cozy.
- Write the blurb and quotes the way Nick actually talks. No marketing language. Output valid JSON only.
```
