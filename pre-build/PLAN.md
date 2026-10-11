# PLAN.md: Felt (working name)

Hyper-personalized, on-the-ground NYC experiences, recommended with evidence from how similar people felt there.

Built at AI Engineer NYC Hackathon, Sunday October 11, 2026. Hard stop 9:00 PM. Feature freeze 7:30 PM.

> Note for coding agents: this file is the source of truth for scope. Do not add auth providers, extra databases, or features outside the Golden Path without asking.

---

## 1. Product in one paragraph

A user uploads a few photos, and Gemini infers what kind of person they are outdoors (runner, skyline lover, likes quiet). They type what they want ("a run with views of the water and the Empire State Building"). The app returns 2 to 3 real places, each with a "why this is for you" that quotes reflections from earlier people with similar profiles. They tap Start, then Finish, then upload a photo and write how it felt. That reflection immediately becomes evidence for the next person who asks for something similar.

**The novel part:** feelings are the recommendation evidence, matched on two axes: what the experience was, and who felt it.

## 2. Scope

### Golden Path (must work flawlessly)

1. Onboard: first name, 3 to 5 photos, optional one-line bio
2. Profile screen with evidence chips ("Runner: photo 3 shows a race bib")
3. Prompt
4. 2 to 3 recommendation cards: real place, map link, "why for you", 1 to 2 quotes, "right now" line
5. Start, then Finish (buttons plus timer, no GPS)
6. Reflect: photo plus text, consent toggle, emotion tags shown, "profile learned" toast
7. Second user on another phone asks something similar and sees that new reflection quoted

### Explicitly cut

- Instagram, LinkedIn, and all OAuth (no sign-in; anonymous cookie session)
- Snowflake
- GPS or route tracking, booking, social graph, native app
- Sentry is optional (15 minutes, raffle entry); add only after the 5:00 PM checkpoint

### Sponsor focus

- **Gemini API:** every AI step (vision, structured output, Maps grounding, embeddings)
- **Nimble:** real-review cold start, live "right now" context, long-tail discovery
- **Tiger Data (incidental):** it is just Postgres with pgvector; use it if signup takes under 10 minutes, otherwise any Postgres with pgvector

## 3. Stack

| Layer | Choice |
|---|---|
| Framework | SvelteKit (Svelte 5), TypeScript, `@sveltejs/adapter-vercel` |
| Styling | Tailwind CSS, mobile-first, single column, max width 430px |
| LLM | `@google/genai`, model `gemini-3.8-flash` |
| Embeddings | `gemini-embedding-2`, 768 dimensions |
| Web data | Nimble (`@nimble-way/nimble-js` or plain `fetch`) |
| Database | Postgres with pgvector (Tiger Cloud free service), `postgres` npm package |
| Photos | Vercel Blob (`@vercel/blob`) |
| Hosting | Vercel |

### Setup commands

```bash
npx sv create felt        # SvelteKit minimal, TypeScript, add tailwindcss
cd felt
npm i @google/genai @vercel/blob postgres zod
npm i -D @sveltejs/adapter-vercel
```

`svelte.config.js`: use `adapter-vercel`. In long-running routes add:

```ts
export const config = { maxDuration: 60 };
```

### Environment variables (`.env`, and Vercel project settings)

```
GEMINI_API_KEY=            # billing must be enabled: Maps grounding is not on the free tier for 3.8 Flash
NIMBLE_API_KEY=
DATABASE_URL=              # postgres connection string
BLOB_READ_WRITE_TOKEN=     # Vercel Blob
```

Read them with `$env/static/private`. Never import these into client code.

## 4. Repo structure

```
src/
  hooks.server.ts                 # sets anonymous uid cookie, loads user into locals
  lib/
    server/
      db.ts                       # postgres client + small query helpers
      gemini.ts                   # client, generateJson(), embed()
      nimble.ts                   # mapsReviews(), mapsPlace(), webSearch()
      prompts.ts                  # all prompt strings and JSON schemas
      profile.ts                  # buildProfile(), mergeProfileUpdates()
      recommend.ts                # the pipeline (section 7)
      reflect.ts                  # analyzeReflection()
      validate.ts                 # drop unknown place IDs and quote IDs
    components/
      PhotoPicker.svelte
      TraitChip.svelte
      RecCard.svelte
      QuoteBubble.svelte
      BottomBar.svelte
      Toast.svelte
    types.ts
  routes/
    +layout.svelte                # app frame, 430px column
    +page.svelte                  # onboarding
    profile/+page.svelte
    ask/+page.svelte              # prompt + results
    go/[experienceId]/+page.svelte        # start / finish timer
    reflect/[experienceId]/+page.svelte
    api/
      upload/+server.ts           # POST multipart -> Vercel Blob URLs
      profile/+server.ts          # POST {name, photoUrls, bio} -> profile
      recommend/+server.ts        # POST {prompt, lat, lng} -> cards
      experience/+server.ts       # POST start / PATCH finish
      reflect/+server.ts          # POST {experienceId, text, photoUrls, consent}
scripts/
  schema.sql
  seed-places.ts                  # inserts the place list from section 9
  ingest-reviews.ts               # Nimble -> Gemini -> reflections (source = public_review)
static/
  manifest.webmanifest
```

## 5. Data model (`scripts/schema.sql`)

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id),
  traits jsonb NOT NULL,
  summary text,
  embedding vector(768),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE places (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  google_place_id text UNIQUE,
  name text NOT NULL,
  kind text,                      -- run_route | viewpoint | park | walk | food
  lat double precision, lng double precision,
  tags text[],                    -- water_view, esb_view, atlantic, sunrise, quiet ...
  notes text,
  maps_url text
);

CREATE TABLE experiences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id),
  place_id uuid REFERENCES places(id),
  prompt text,
  status text DEFAULT 'recommended',   -- recommended | started | finished
  started_at timestamptz, finished_at timestamptz
);

CREATE TABLE reflections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id uuid REFERENCES places(id),
  experience_id uuid REFERENCES experiences(id),
  author_id uuid REFERENCES users(id),
  source text NOT NULL,           -- user | public_review | seed
  display_name text,              -- "Maya, runner" or "Google Maps reviewer"
  body text,
  quote text,                     -- one quotable sentence
  emotions text[], themes text[],
  photo_urls text[],
  consent_share boolean DEFAULT true,
  embedding vector(768),
  author_profile_embedding vector(768),   -- null for public reviews
  created_at timestamptz DEFAULT now()
);
```

At this scale (under 1,000 rows) no vector index is needed; exact search is fast.

### Retrieval query

```sql
SELECT r.id, r.quote, r.display_name, r.source, r.emotions,
       p.id AS place_id, p.name, p.google_place_id, p.lat, p.lng,
       0.6 * (1 - (r.embedding <=> $1::vector))
     + 0.4 * COALESCE(1 - (r.author_profile_embedding <=> $2::vector), 0.5)
     + CASE WHEN r.source = 'user' THEN 0.05 ELSE 0 END AS score
FROM reflections r JOIN places p ON p.id = r.place_id
WHERE r.consent_share
ORDER BY score DESC
LIMIT 12;
```

`$1` is the intent embedding, `$2` is the asker's profile embedding. Real user reflections get a small boost over public reviews.

## 6. Gemini: five jobs

All calls go through `src/lib/server/gemini.ts`.

```ts
import { GoogleGenAI } from '@google/genai';
import { GEMINI_API_KEY } from '$env/static/private';

export const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
export const MODEL = 'gemini-3.8-flash';

export async function generateJson<T>(contents: any, schema: object): Promise<T> {
  const res = await ai.models.generateContent({
    model: MODEL,
    contents,
    config: { responseMimeType: 'application/json', responseSchema: schema }
  });
  return JSON.parse(res.text!) as T;
}

export async function embed(text: string, kind: 'query' | 'doc'): Promise<number[]> {
  const prefixed = kind === 'query'
    ? `task: search result | query: ${text}`
    : `title: none | text: ${text}`;
  const out = await ai.models.embedContent({
    model: 'gemini-embedding-2',
    contents: prefixed,
    config: { outputDimensionality: 768 }
  });
  return out.embeddings![0].values!;
}
```

Images are passed as `{ inlineData: { mimeType, data: base64 } }` parts. Fetch from Blob URLs server side and base64 encode.

### Job 1: Profiler (vision, structured)

Input: 3 to 5 photos, optional bio. Output schema:

```json
{
  "activities": [{ "name": "running", "confidence": 0.9, "evidence": "photo 3: race bib" }],
  "scenery": ["waterfront", "skyline"],
  "pace": "chill | moderate | active",
  "social": "solo | small_group | crowd",
  "time_of_day": ["sunrise"],
  "values": ["family", "nostalgia"],
  "avoid": ["crowds"],
  "summary": "One paragraph describing who this person is outdoors."
}
```

Prompt:

```
You are building an outdoor-experience profile from a person's photos and optional bio.
Infer only activity, scenery, pace, and mood preferences that are visibly supported.
For every activity give the photo number or bio phrase as evidence and a confidence 0 to 1.
Never infer health, religion, ethnicity, sexuality, politics, or income.
If evidence is thin, return fewer traits rather than guessing.
```

Then `embed(summary, 'doc')` and store in `profiles`.

### Job 2: Intent parser (structured)

```json
{
  "activity": "run",
  "duration_or_distance": "5 miles",
  "must_see": ["water", "Empire State Building"],
  "vibe": "scenic, uplifting",
  "time_window": "now | sunrise | evening",
  "feasibility_note": "string or null",
  "search_query": "scenic running routes NYC with river and Empire State Building views"
}
```

Prompt addition: `If the request combines things that rarely coexist in NYC (for example Atlantic Ocean views plus the Empire State Building), set feasibility_note to an honest one-sentence explanation and the closest real alternative.`

Then `embed(prompt + ' ' + vibe, 'query')`.

### Job 3: Maps-grounded candidates

```ts
const res = await ai.models.generateContent({
  model: MODEL,
  contents: `List up to 5 real places in New York City for: ${intent.search_query}.
             Must satisfy: ${intent.must_see.join('; ')}.`,
  config: {
    tools: [{ googleMaps: {} }],
    toolConfig: { retrievalConfig: { latLng: { latitude: lat, longitude: lng } } }
  }
});
const grounded = (res.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [])
  .filter((c: any) => c.maps)
  .map((c: any) => ({ placeId: c.maps.placeId, title: c.maps.title, uri: c.maps.uri }));
```

Constraints: English only, text only, cannot be combined with `responseSchema` in the same call (keep it as its own step). Upsert any new grounded places into `places`. Show a "Places from Google Maps" attribution with links on cards.

### Job 4: Composer (structured, IDs only)

Input: profile traits, intent, CANDIDATES (place id, name, tags), EVIDENCE (reflection id, place id, quote, display_name, emotions, source), LIVE (per place, from Nimble).

```json
{
  "feasibility_note": "string or null",
  "cards": [{
    "place_id": "uuid from CANDIDATES",
    "title": "Sunrise loop at Gantry Plaza",
    "plan": "2 to 3 sentences: where to start, which way to go, where to stop",
    "why_for_you": "2 sentences tying the user's traits to what similar people felt",
    "quote_ids": ["uuid from EVIDENCE"],
    "right_now": "string or null"
  }]
}
```

Prompt:

```
Recommend at most 3 experiences for this person.
Use only place_id values from CANDIDATES and only quote_ids from EVIDENCE. Never write quote text yourself.
Prefer places that have evidence. Prefer evidence whose author resembles the user and say how they are similar.
In why_for_you, name at least one of the user's traits explicitly.
If nothing satisfies a must_see, say so in feasibility_note and offer the closest match.
```

### Job 5: Reflection analyzer (vision + text, structured)

```json
{
  "emotions": ["awe", "calm", "nostalgia", "pride", "joy", "belonging", "gratitude", "exhilaration"],
  "themes": ["skyline", "family", "home"],
  "quote": "The single most quotable sentence, the user's own words, lightly trimmed.",
  "profile_updates": { "add_scenery": ["sunrise"], "add_values": [], "add_activities": [] },
  "learned": "Short toast text: 'You love sunrise runs by the water.'"
}
```

`emotions` must be chosen from the fixed list. Then embed `body` (and the photo, if using multimodal embedding) as a doc, copy the author's profile embedding into `author_profile_embedding`, merge `profile_updates`, and re-embed the profile summary.

## 7. Recommendation pipeline (`recommend.ts`)

```
1. intent        = Job 2(prompt)
2. intentVec     = embed(...)                         } run 2 and 3 in parallel
3. grounded      = Job 3(intent)                      }
4. evidence      = retrieval query(intentVec, profileVec)   -> top 12
5. candidates    = places from evidence  UNION  grounded places (upserted)
6. live          = Nimble mapsPlace() for top 3 candidates, 4s timeout, null on failure
7. cards         = Job 4(profile, intent, candidates, evidence, live)
8. validate      = drop cards with unknown place_id; drop unknown quote_ids
9. hydrate       = attach quote text, display_name, source, maps_url from DB
10. insert experiences rows (status = recommended), return cards
```

Target latency: under 10 seconds. Show a staged loader ("Reading your profile", "Finding real places", "Asking people like you"). Cache the full response for the scripted demo prompt.

**Long-tail fallback:** if step 4 returns fewer than 3 rows above a score of 0.45, call Nimble `webSearch(intent.search_query)`, have Gemini extract place names from the results, and feed those names into the Job 3 prompt so Maps grounding confirms each is real.

## 8. Nimble: three jobs

All calls go through `src/lib/server/nimble.ts`. Keep three functions and nothing else:

```ts
mapsReviews(query: string): Promise<{ place: string; reviews: { text: string; rating: number }[] }>
mapsPlace(query: string):   Promise<{ hours?: string; busyness?: string; rating?: number } | null>
webSearch(query: string):   Promise<{ title: string; url: string; snippet: string }[]>
```

> **Verify first (10 minutes):** confirm endpoint paths, template names (`google_maps_search`, `google_maps_place`, `google_maps_reviews`), and response field names at docs.nimbleway.com with one test call each before wiring them in. Field names above are our wrapper's shape, not Nimble's.

### Job A: Cold start with real evidence (`scripts/ingest-reviews.ts`)

For each place in section 9:

1. `mapsReviews(place.name + ' New York')`, take up to 20 reviews
2. One Gemini call: "From these reviews, pick up to 3 sentences that express how the place made someone feel (not logistics, not complaints about parking). Return each as a short excerpt under 25 words, with emotions from the fixed list and themes."
3. Insert as `reflections` with `source = 'public_review'`, `display_name = 'Google Maps reviewer'`, `author_profile_embedding = null`
4. `embed(excerpt, 'doc')`

UI labels these as "From public reviews" so they are never mistaken for app users. Run once; takes a few minutes; roughly 40 Nimble calls.

### Job B: Live "right now" line

In pipeline step 6. Pass hours and busyness (if returned) plus the current time to the composer, which writes one line such as "Open until 1 AM, usually quiet at this hour." If Nimble returns nothing, the line is omitted.

### Job C: Long-tail discovery

Described in section 7. This is the answer to "what if I ask for something weird".

## 9. Seed places (`scripts/seed-places.ts`)

Start with these; add more with the same shape. Tags must be honest.

| Name | Kind | Tags | Honest note |
|---|---|---|---|
| Gantry Plaza State Park, LIC | run_route | water_view, esb_view, skyline, sunrise | East River; direct Midtown and Empire State view |
| Hunters Point South Park | run_route | water_view, esb_view, skyline | East River; Empire State and Chrysler |
| Central Park Reservoir loop | run_route | water_view, skyline, quiet | 1.58 miles, run counterclockwise; reservoir, not river |
| Brooklyn Bridge Park, Pier 1 to Pier 6 | run_route | water_view, skyline, harbor | Lower Manhattan skyline, not Empire State |
| Washington Street, DUMBO | viewpoint | esb_view, bridge | Empire State framed in the Manhattan Bridge arch |
| Domino Park, Williamsburg | walk | water_view, skyline | East River |
| Roosevelt Island loop | run_route | water_view, skyline, quiet | East River both sides |
| Hudson River Greenway, Chelsea to Battery | run_route | water_view, sunset | Hudson; city is behind you |
| Fort Tilden, Battery Harris East | viewpoint | atlantic, skyline, quiet | Ocean plus distant skyline; closest match for "Atlantic and skyline" |
| Coney Island boardwalk | run_route | atlantic, lively | True ocean; no skyline at ground level |
| Rockaway Beach boardwalk | run_route | atlantic | Ocean only |
| The High Line | walk | skyline, lively | Elevated; peeks of Empire State |
| Little Island | viewpoint | water_view, sunset | Hudson |
| East River Esplanade | run_route | water_view | Queens-facing |

**Known reality check:** no NYC run has both a true Atlantic view and a clear Empire State Building view. The app should say so and offer Fort Tilden (ocean plus distant skyline) or Gantry Plaza (water plus Empire State).

## 10. UI

- Global: `max-w-[430px] mx-auto min-h-dvh`, large tap targets (min 48px), bottom action bar within thumb reach, system font, one accent color
- Onboarding: name field, `PhotoPicker` with `<input type="file" accept="image/*" multiple>`, optional bio, one big button
- Profile: avatar initial, summary sentence, `TraitChip` per trait with evidence shown on tap
- Ask: one text area with 3 example prompts as tappable chips; staged loader; results as full-bleed `RecCard`s
- RecCard: title, plan, "Why for you", `QuoteBubble`s (badge: "From someone like you" or "From public reviews"), "Right now" line, "Open in Maps" link, **Start** button
- Go: place name, big timer, **Finish** button
- Reflect: camera input (`accept="image/*" capture="environment"`), text area with prompt "How did it make you feel?", share toggle, then emotion tags and a `Toast` with what the profile learned
- Use Svelte transitions (`fly`, `fade`) on cards, chips, and the toast
- `static/manifest.webmanifest` with `"display": "standalone"` so it launches full screen from the home screen

## 11. Session without sign-in (`hooks.server.ts`)

```ts
export const handle = async ({ event, resolve }) => {
  let uid = event.cookies.get('uid');
  if (!uid) {
    uid = crypto.randomUUID();
    event.cookies.set('uid', uid, { path: '/', maxAge: 60 * 60 * 24 * 30, httpOnly: true });
  }
  event.locals.uid = uid;
  return resolve(event);
};
```

Insert the `users` row on first profile creation. For the demo, the two phones are simply two cookies.

## 12. Timeline

| Time | Person A (AI + data) | Person B (UI + Nimble) | Checkpoint |
|---|---|---|---|
| 1:00 to 2:00 | Repo, Vercel, DB + schema, Gemini billing, Job 1 profiler | App frame, onboarding, upload to Blob, profile screen | Photos in, profile chips out, deployed |
| 2:00 to 3:30 | Jobs 2, 3, 4 + retrieval + validate | Nimble test calls, `nimble.ts`, seed places, review ingest | Prompt returns grounded cards with quotes |
| 3:30 to 5:00 | Job 5, profile merge, experience endpoints | Ask, RecCard, Go, Reflect screens | Full loop works across two phones |
| 5:00 to 6:30 | Retrieval tuning, long-tail fallback, caching | Nimble live line, transitions, polish | Optional: Sentry wizard |
| 6:30 to 7:30 | Hardening, error states, demo cache | README, screenshots, manifest | **Feature freeze 7:30** |
| 7:30 to 8:15 | Rehearse 3 times on two phones, backup video | Submission, prize opt-ins (Gemini, Nimble, Tiger if used) | Submitted |

Kill rules: if Maps grounding is not returning place IDs by 3:00, use seed places only. If Nimble review ingest is not working by 3:00, hand-write 30 clearly labeled seed reflections and keep Nimble for the live line only.

## 13. Demo script (about 2.5 minutes)

1. **Hook (15s):** "Ratings tell you a place is good. They don't tell you it will make you feel something."
2. **Profile (25s):** upload photos; Gemini shows traits with evidence.
3. **Ask (35s):** "a run with views of the water and the Empire State Building." Cards appear: real Google Maps places, a quote, and a live line from Nimble. Mention the honest answer if asked for the Atlantic too.
4. **Do it (25s):** Start, Finish, upload today's photo, write how it felt; show emotion tags and the profile toast.
5. **Loop closes (25s):** second phone asks "somewhere to run that feels like home"; the reflection written seconds ago is quoted.
6. **Close (15s):** "Gemini does the seeing and reasoning, Nimble brings the live web and real reviews, and every finished experience makes the next recommendation more human."

Judge answers:

- **Hallucinations:** the model only references place IDs from Maps grounding or our DB, and quotes by ID; a validator drops anything else and quote text comes from the database.
- **Cold start:** real public reviews via Nimble, labeled as such, plus reflections from people at this event.
- **Why not ChatGPT or Google Maps:** they cite ratings and reviews at large; this cites the feelings of people like you, and improves with every completed experience.
- **Privacy:** no social logins, photos are used only to build the profile, no sensitive inferences, sharing a reflection is a toggle.

## 14. Rules and hygiene

- Repo must be public; all code written during the event; disclose AI-assisted coding in the README
- Strip EXIF location from uploaded photos before storing, or do not display it
- Keep review excerpts short and labeled with their source
- Confirm the submission platform, deadline, and video requirement with organizers

## 15. Things to verify before relying on them

- Nimble endpoint paths, template names, and response fields (section 8)
- `tools: [{ googleMaps: {} }]` works with `generateContent` on your installed `@google/genai` version; shape of `groundingChunks[].maps`
- `embedContent` response shape (`embeddings[0].values`) and `outputDimensionality` on `gemini-embedding-2`
- Gemini project is on a billed tier (Maps grounding)
