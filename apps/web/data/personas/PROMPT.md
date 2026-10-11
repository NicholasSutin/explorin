# Agent prompt: build a personal seed persona

Give this to an AI agent that can see your personal data (photos, Strava, calendar, Maps saved places, notes, posts).
Save its output as `data/personas/<id>.json` (gitignored), then run `npm run db:seed-persona -- data/personas/<id>.json`.
The preset chips on the onboarding screen pick the file up automatically.

Replace `Nick` with the person's first name before sending.

---

```text
You are building a seed profile for Nick for a demo app called Felt, which recommends outdoor NYC experiences based on how similar people felt at real places.

Gather evidence about Nick as a person OUTDOORS from the sources you can access: photos and captions, Strava or fitness logs, calendar events, Google Maps saved places and timeline, notes, journal entries, and social posts. Use only what is clearly supported. Never infer or include health conditions, religion, ethnicity, sexuality, politics, income, or anyone else's private details. Use first names only.

Return ONE JSON object with exactly this shape and nothing else:

{
  "id": "nick",
  "name": "Nick",
  "traits": {
    "activities": [{ "name": "running", "confidence": 0.9, "evidence": "where this came from, one phrase" }],
    "scenery": ["waterfront", "skyline"],
    "pace": "chill | moderate | active",
    "social": "solo | small_group | crowd",
    "time_of_day": ["sunrise", "evening"],
    "values": ["family", "nostalgia", "routine"],
    "avoid": ["crowds"],
    "summary": "One warm paragraph in second person ('You ...') describing who Nick is outdoors. 60 to 110 words."
  },
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
- 3 to 6 activities with confidence 0 to 1 and real evidence each. If evidence is thin, return fewer rather than guess.
- 4 to 8 reflections, each tied to a specific real NYC place Nick has actually been. Prefer these names when they fit, spelled exactly: Gantry Plaza State Park, Hunters Point South Park, Central Park Reservoir, Brooklyn Bridge Park, Washington Street, DUMBO, Domino Park, Roosevelt Island, Hudson River Greenway, Fort Tilden, Coney Island Boardwalk, Rockaway Beach Boardwalk, The High Line, Little Island, East River Esplanade.
- For any other place, fill new_place as { "kind": "run_route | viewpoint | park | walk | food", "lat": 0.0, "lng": 0.0, "tags": ["water_view", "skyline", "quiet"], "notes": "one honest line about what it offers" } with accurate coordinates.
- emotions must come only from: awe, calm, nostalgia, pride, joy, belonging, gratitude, exhilaration.
- Write quotes the way Nick actually talks. No marketing language. Output valid JSON only.
```
