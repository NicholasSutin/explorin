# Finish the feat/vision revamp: old accounts, legacy code, legacy tables

Status: proposed 2026-10-17, approved, not started. Release A ships with the feat/vision deploy; B and C follow.

## Context

Commit `eeef15d` on `feat/vision` turned Explorin into one sign-in-first flow. The old flows were moved into `apps/web/legacy/` but never retired. The old data and the old accounts were never migrated. Checks run on 2026-10-17 (read-only SQL, live HTTP, code sweeps):

- **Production still runs `main` (52e3fc7).** `/welcome` returns 404 and `/api/demo` returns 200. Dev and prod share one Tiger database, so every database step has to be timed against the feat/vision deploy.
- **3 of the 4 real accounts would break when feat/vision deploys.** They have `onboardedAt` set from the old onboarding but no `taste` row.
  - They would plan with "No taste profile yet."
  - Settings → Re-grade would send them home: `/onboarding/taste` → `/onboarding?back`, and the guard only lets onboarded accounts through with `?edit` (`hooks.server.ts:67`).
  - Their old interests are still in `"user".interests`, stored as a JSON string that contains a JSON array.
- **Data the old flows left behind:**
  - `profiles` (9 guest rows + 1 account), `experiences` (34 + 3), `response_cache` (1), and the `places.live` / `places.live_at` columns.
  - `reflections.experience_id`, which has a foreign key to `experiences` with no cascade.
  - 9 orphan `users` rows from guest browsers. 2 of them wrote the only `source='user'` reflections, which are still served as "people like you" quotes.
- **Leftover code:** `legacy/` itself plus about 15 dead exports, components and assets in live code. `npm run lint` and Tailwind both scan `legacy/`. User-facing copy still promises a guest demo, and the marketing site says "Photos stay on your device", which is false.
- **Unfinished items in the docs:**
  - ADR-0005 step 2: "people like you" still matches places by fuzzy name, not place id.
  - system-design.md says to adopt a migration tool "at the first destructive change". Dropping the old tables is that change.
  - ADR-0003 and ADR-0005 status lines were never marked as superseded.
- **Lost feature:** the old reflect step taught the writer's profile from their note (`legacy/lib/server/profile.ts` `mergeProfileUpdates`). Nothing in the new flow updates `taste` from a trip.

**Goal:** ship feat/vision without stranding any account, then remove everything the old flows left behind, keeping logins and the two real quotes intact.

**Never change:** the default better-auth password hasher, `cookiePrefix: 'explorin'`, `SESSION_COOKIES`, uuid ids (the same id is used as the R2 key prefix), or the `ensureUser` mirror hook.

---

## Release A: ships together with the feat/vision deploy

### A1. Versioned migrations (the first destructive change needs them)
- **`apps/web/scripts/migrate.ts`** should:
  - Print the database host and the list of pending migrations, and be a **dry run by default**. `--apply` executes.
  - Take `pg_advisory_lock` so two runs can't overlap.
  - Before applying `schema.sql`, note whether `to_regclass('public."user"')` is NULL (a brand-new database). Then apply `schema.sql` as today.
  - `CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz DEFAULT now())`.
  - On a brand-new database, record every file in `scripts/migrations/` as applied without running it, so migrations never need guards for empty databases.
  - **Refuse to run** if the database records a migration this checkout doesn't have.
  - Apply each pending `scripts/migrations/NNNN-*.sql` in name order. Each one runs in its own `sql.begin` (using `tx.unsafe`) and is recorded in the same transaction.
  - Reuse `sql` from `scripts/_shared.ts`.
- **`package.json`:** `setup` becomes `db:migrate -- --apply && db:seed`.
- **`src/lib/server/db.ts`:** add one comment next to `prepare: false`. It is what keeps Hyperdrive from caching session reads. With `prepare: true`, an `onboardedAt` change could take up to ~75 s to show.
- **Docs:** new `docs/adr/0009-versioned-migrations.md`, and update the "Migrations" row in `docs/system-design.md` §5.

### A2. `scripts/migrations/0001-legacy-taste.sql`
This targets every account with `onboardedAt` set and no `taste` row. It's idempotent: once an account has a taste row, it no longer matches.
```sql
INSERT INTO users (id, name) SELECT id, name FROM "user" ON CONFLICT (id) DO NOTHING;
WITH legacy AS (
  SELECT u.id, CASE jsonb_typeof(u.interests)
                 WHEN 'string' THEN (u.interests #>> '{}')::jsonb
                 WHEN 'array'  THEN u.interests END AS arr
  FROM "user" u
  WHERE u."onboardedAt" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM taste t WHERE t.user_id = u.id)
), ins AS (
  INSERT INTO taste (user_id, interests)
  SELECT l.id, ARRAY(
    SELECT DISTINCT m FROM jsonb_array_elements_text(COALESCE(l.arr, '[]')) i,
      LATERAL (SELECT CASE i WHEN 'Food' THEN 'Food & drink' ELSE i END AS m) x
    WHERE m = ANY ('{Nature,"Art & culture","Food & drink","Coffee & sweets",History,Architecture,
                     Nightlife,Shopping,"Hidden gems","Slow moments","Something active",Photography}'))
  FROM legacy l ON CONFLICT (user_id) DO NOTHING RETURNING user_id)
UPDATE "user" SET "onboardedAt" = NULL, "updatedAt" = now() WHERE id IN (SELECT user_id FROM ins);
```
- The interest list is a snapshot of `INTERESTS` in `src/lib/taste.ts`.
- The AI-written `profiles` summary is **not** copied. It isn't the person's own words, and `tasteSummary` quotes the blurb as "In their words".
- The guard then routes these accounts through onboarding again. Their session and password are untouched.

### A3. Onboarding fixes
- **`src/routes/(onboarding)/onboarding/+page.server.ts:25`:** resume only when step 1 is really done. `taste && homeCity` becomes `taste?.blurb && homeCity`. Migrated accounts then see About-you with their interests already filled in. New accounts always have a blurb, so nothing changes for them.
- **`src/routes/(onboarding)/onboarding/taste/+page.server.ts:13`:** `if (!taste?.blurb) redirect(303, '/onboarding?edit')`. This fixes the Re-grade dead end, and nobody can reach the tier list without writing a blurb. `?edit` makes no difference for accounts that aren't onboarded.

### A4. User-facing copy that becomes false on deploy (or already is)
- **Web app:** remove the "NYC demo works without an account" lines in `src/routes/(auth)/login/+page.svelte:63` and `signup/+page.svelte:90-91`.
- **Marketing site (deploy it too):**
  - `apps/marketing/src/routes/+page.svelte:104-105`: "Photos stay on your device" becomes copy saying photos are private to your account.
  - `apps/marketing/src/lib/server/email.ts:20`: "the NYC demo is open" becomes an invitation to create an account.
  - Update the "demo link" wording in `apps/marketing/src/env.ts:45` and `apps/marketing/README.md:36`.
- **ADR status lines:** ADR-0003 and ADR-0005 become "Superseded in part by ADR-0007".

### A5. Retire the legacy code (separate commit, same PR; touches no data)
- **Folder:** delete `apps/web/legacy/`. It can't run anyway: it imports `getProfile`, `upsertProfile`, `groundedPlaces` and `Traits`, which no longer exist.
- **Dead server code:**
  - `src/lib/server/validate.ts`
  - `imagePart` in `gemini.ts`, along with its `#storage` / `getPhoto` import
  - `mapsPlace`, `LivePlace` and `pageText` in `nimble.ts`, plus the `nimble.extract` and `nimble.maps_place` keys in `pricing.ts`
  - `photoUrl` in `http.ts`, `bbox` in `geo.ts`, `toCredits` in `usage.ts`, `emailConfigured` in web `email.ts`
- **Dead client code:** `photoDataUrl` in `client.ts` (and un-export `errorMessage`), `planned` in `trip-ui.ts`, the `LatLng` re-export in `plan.ts`.
- **Auth constant:** either use `SIGNUP_PASSWORD_PATH` in `hooks.server.ts` and the signup page, or delete it.
- **Map styles:**
  - Delete `src/lib/components/PlaceMap.svelte`, which was the only caller of `style=ink|cloud`.
  - Remove the ink and cloud styles and `GOOGLE_MAPS_MAP_ID` from `maps.ts`, `src/env.ts`, `.env.example`, `.env.prod.example` and the `wrangler.jsonc` comment.
  - Keep `style=paper`, because `scrapbook/layout.ts:231` sends it.
- **Images:** delete the 14 unused `static/marketing/*.webp`. **Keep** `high-line-fall`, `brooklyn-bridge` and `the-met-inside`, which `/welcome` uses.
- **Stale comments and descriptions:**
  - Comments: `auth.ts:52,111`, `db.ts:76,90`, the `nimble.ts` header, `gemini.ts:73`, the `evidence.ts` header, `adventure.ts:52`.
  - Env descriptions: `env.ts:8,13,41`.
  - `.env.example`: lines 7-10, 33-34, 38-39 (`DEMO_CACHE`), 42 and 56-57. Also `.env.prod.example:12`.
  - The `legacy/` line in `apps/web/README.md:58`, `seed-reflections.ts:3`, and the persona-chips line in `data/personas/README.md`.
- **Smoke scripts:** drop the Maps-grounding probe from `scripts/gemini-smoke.ts` and the `google_maps_search` probe from `scripts/nimble-smoke.ts`.
- **Decided not to do:** dropping `export` from symbols that are only used inside their own file, and type-checking `tests/`. Both would add churn without fixing anything.

### Deploy sequence (Nick)
1. Merge feat/vision to main and deploy the `explorin-app` and `explorin-marketing` Workers.
2. **Right after that**, run `npm run db:migrate` (dry run, should list 0001), then `npm run db:migrate -- --apply`.
   - Don't run 0001 before the deploy: main's old onboarding would set `onboardedAt` again.
3. If `GOOGLE_MAPS_MAP_ID` was ever set as a secret: `wrangler secret delete GOOGLE_MAPS_MAP_ID`.

---

## Release B: drop the legacy data (after a few days of soak; this is the point where rolling back to main stops being possible)

### B1. Code first (deploy before 0002 runs)
- **`scripts/schema.sql`:** remove `profiles` (9-15), the `places.live` and `live_at` columns and ALTERs (27-31), `experiences` (33-41), `reflections.experience_id` (46), `experiences_user_idx` (61), `response_cache` (63-67), `"user".interests` (78) and the mirror comment (70).
  - Every one of these has to go. A leftover `CREATE INDEX` on `experiences` would make every later migrate fail.
- **`src/lib/server/account.ts` `deleteAccount`:** remove the `experiences` and `profiles` deletes. The reflections delete becomes `WHERE author_id = ${userId}`. Update the header comment.
  - Without this change, dropping the tables makes account deletion return a 500.

### B2. `scripts/migrations/0002-drop-legacy.sql`
```sql
ALTER TABLE reflections DROP COLUMN IF EXISTS experience_id;      -- drops the foreign key with it
DROP TABLE IF EXISTS experiences, profiles, response_cache;
ALTER TABLE places DROP COLUMN IF EXISTS live, DROP COLUMN IF EXISTS live_at;
ALTER TABLE "user" DROP COLUMN IF EXISTS interests;
DELETE FROM users x                                               -- the 7 orphan guest rows nothing references
WHERE NOT EXISTS (SELECT 1 FROM "user" u WHERE u.id = x.id)
  AND NOT EXISTS (SELECT 1 FROM reflections r WHERE r.author_id = x.id)
  AND NOT EXISTS (SELECT 1 FROM taste t WHERE t.user_id = x.id)
  AND NOT EXISTS (SELECT 1 FROM trips t WHERE t.user_id = x.id)
  AND NOT EXISTS (SELECT 1 FROM usage_events e WHERE e.user_id = x.id);
```
- The 2 guest-written reflections and their `users` rows stay.
- Their R2 photos can't be served any more, but they're harmless. Leave them.
- **Before applying:** rehearse on a Tiger fork, then back up with `pg_dump -t experiences -t profiles -t response_cache` or keep the fork as a snapshot.

---

## Release C: "people like you" loose ends

### C1. Match quotes by place id (ADR-0005 step 2)
- **`scripts/migrations/0003-reflection-place-id.sql`:** `ALTER TABLE reflections ADD COLUMN IF NOT EXISTS google_place_id text`, backfilled from `places.google_place_id`. Mirror the column in `schema.sql`.
- **`src/lib/server/keepsake.ts` `saveKeepsake`:** write `highlight.placeId` into the new column.
- **`src/lib/server/evidence.ts` `attachVoices`:** match a stop's `placeId` against `r.google_place_id`. Use the fuzzy name match only when one side has no id.
  - This avoids the `places` name-uniqueness problem in `upsertGroundedPlace`, where chains with the same name get merged into one row.
- **Docs:** tick the ADR-0005 action items.

### C2. Learn from trip notes (brings back the old profile update)
1. **Additive migration first:**
   - `0004-taste-learned.sql`: `ALTER TABLE taste ADD COLUMN IF NOT EXISTS learned text[] NOT NULL DEFAULT '{}'`.
   - Add the same column to the `taste` table in `schema.sql`.
2. **Drafting (`src/lib/server/keepsake.ts`):**
   - `draftKeepsake` gets `learned` added to the existing `keepsake.draft` schema. It holds at most 2 phrases of up to 60 characters each, and uses `.catch([])` so one bad field doesn't throw away the draft.
   - The prompt says: skip anything already in "About them", and never infer sensitive traits such as health, religion or politics.
   - The fallback draft returns `learned: []`.
3. **Types and input:**
   - Add `learned` to `KeepsakeDraft` in `src/lib/keepsake.ts`.
   - Add `learned` to `keepsakeInput`, using `.default([])` so pages opened before the deploy still save.
4. **Saving:**
   - The done page (`src/routes/(trip)/trip/[id]/done/+page.svelte`) shows the phrases as removable chips under the heading "Explorin will remember".
   - The finish endpoint (`src/routes/api/trip/[id]/finish/+server.ts`) calls a new `addLearned(uid, name, phrases)` in `src/lib/server/taste.ts` through `background()` (`src/lib/server/background.ts`). That keeps usage counted and the response fast.
   - Call it from the endpoint, not inside `saveKeepsake`, because `saveKeepsake` returns early in several cases.
   - `addLearned` checks each phrase on the server, removes duplicates ignoring case (the finish request can be sent twice), keeps the newest 8, and calls `refreshSummary`.
5. **Summary text:** `tasteSummary` in `src/lib/taste.ts` adds "Learned from their trips: …". Make `TasteInput.learned` optional.
6. **Settings:** `src/routes/(app)/settings/` lists the learned phrases next to the tier list, each with a remove button.

### C3. Update `scripts/seed-persona.ts` to the new taste shape (low priority)
- Persona files become `{ name, blurb, interests, grades, reflections }`.
- The author vector becomes `embedDoc(tasteSummary(...))`. `src/lib/taste.ts` has no imports, so the script can import it directly. That puts seeded quotes in the same vector space as real askers.
- Update `data/personas/README.md` and the example file to match.

---

## Verification
- **Every release:**
  - `npm run check`. Ignore errors under `.svelte-kit/`, which appear after any build.
  - `npm run lint`.
  - `tests/auth.spec.ts`.
  - `tests/journey.spec.ts`. It ends by deleting the account, so it covers the `deleteAccount` change. Run it as described in memory: dev server on 127.0.0.1:4173 with Turnstile test keys, `RESEND_API_KEY=`, and `E2E_SERVER_LOG` set; Playwright via `node ../../node_modules/@playwright/test/cli.js test`.
- **Migration rehearsals:** use a Tiger fork of `vhare1wvl4` and delete it afterwards; it's billed while it runs.
  - Point `DATABASE_URL` at the fork.
  - The dry run should list 0001. `--apply` should leave the 3 accounts with `taste.interests` set and `onboardedAt` NULL. A second run should be a no-op.
  - Start a dev server against the fork. Create a test account, give it the old shape with SQL (`onboardedAt` set, string-encoded interests, no taste row), and apply. Then check that sign-in lands on About-you with interests filled in, the tier list completes, and `onboardedAt`, `taste.summary` and `taste.embedding` are all set.
  - **Empty-database check:** inside the fork, run `CREATE DATABASE scratch` and `CREATE EXTENSION vector` there, then migrate. Every file should be recorded as baseline and nothing should run.
  - **Release B:** run 0002 on a fresh fork. Afterwards `SELECT count(*) FROM reflections WHERE source='user'` should still be 2, and journey.spec should pass against the fork.
- **Production after 0001:** a SQL check that no row has `onboardedAt` set without a taste row. Nick signs in with his own account and sees About-you with his interests filled in.
- **Release C:**
  - Finishing a trip with a note fills `taste.learned`. Removing a phrase in Settings rewrites `taste.summary`.
  - A plan that includes a place with a matching quote shows it when matched by `placeId`.

## Nick's actions
- Approve each release PR, merge and deploy (web and marketing).
- Run `db:migrate -- --apply` against production at the points marked above.
- Sign in afterwards to check.
- Delete the `GOOGLE_MAPS_MAP_ID` secret if it exists.
- Delete the rehearsal forks.
