# Finish the feat/vision revamp: old accounts, legacy code, legacy tables

Status: built and rehearsed on Tiger forks, 2026-10-18. A, C and B were built as stacked PRs, then merged into one release on 2026-10-18 (PR #2, `feat/vision` → `main`). The migrations still run at three moments, held apart with `db:migrate --through`; see "Combined release" and the deploy sequence at the end. "Build notes" record where the build differs from the plan below.

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
   - The done page (`src/routes/(trip)/trip/[id]/done/+page.svelte`) shows the phrases as chips under the heading "Explorin will remember". (Built as opt-in "Explorin can remember" after the security review; see Build notes.)
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

## Build notes (2026-10-18)

### Where the build differs from the plan

- **Order and numbering.** C ships before B, because C only adds things and B has to wait for a soak anyway.
  - The migrations are `0001-legacy-taste.sql` (A) and `0002-drop-legacy.sql` (B).
  - C needs no migration file. `taste.learned` and `reflections.google_place_id` are `ADD COLUMN IF NOT EXISTS` in `schema.sql`, the same as other additive columns (ADR-0009 rule).
  - There is no backfill. Older quotes match by name, as before: after the correctness review the query no longer borrows `places.google_place_id`, which can belong to another branch when `upsertGroundedPlace` matched the row by name.
- **The runner** uses one reserved postgres.js connection with explicit `BEGIN`/`COMMIT`, because `sql.begin()` on a reserved connection would go through the pool. That one connection holds the advisory lock. The check that refuses unknown migrations runs before `schema.sql` is applied.
- **0001** keeps the person's interest order (`WITH ORDINALITY`) and treats a value that isn't an array as empty.
- **Static maps.** `/api/map` dropped the `style` parameter entirely, since paper is the only style. `scrapbook/layout.ts` no longer sends it, and old URLs that still do get the same image.
- **`SIGNUP_PASSWORD_PATH` was deleted.** The signup page is client code and can't import a server module.
- **Also fixed in C:**
  - A place whose name normalised to an empty string matched every stop. Both SQL and JS now skip empty names.
  - The SQL name normalisation now collapses spaces the same way the JS does.
- **Learned phrases.** The draft holds at most 2 phrases of up to 60 characters, and the store keeps the 8 newest.
  - Phrases that differ only in case are merged in a single `UPDATE`, so concurrent requests can't lose one.
  - A finish request sent twice does no extra work.
  - Settings lists the phrases under "Learned from your trips", each with a remove button.
- **The persona seed** validates interests, audience and grade keys against `src/lib/taste.ts` before writing anything.

### Rehearsal on fork `cv3h3xpi70` (deleted afterwards)

- **A:**
  - The dry run listed 0001. `--apply` gave the 3 accounts taste rows with their old interests and cleared `onboardedAt`, and a second run did nothing.
  - A new account was given the old shape with SQL. Re-grade landed on About-you before the migration. After 0001, About-you showed the old interests, with `Food` mapped to `Food & drink` and an unknown value dropped. After the tier list, `onboardedAt`, `summary` and `embedding` were all set, and deleting the account through Settings worked.
  - `auth.spec` and `journey.spec`: 8 passed.
- **C:**
  - `schema.sql` added both columns.
  - `journey.spec`: 8 passed. The note produced 2 learned phrases, Settings listed them, and removing one there worked.
  - The quote-matching rules were checked in SQL:
    - an id match wins even when the names differ;
    - another branch with the same name is excluded;
    - the name fallback works for a quote without an id;
    - a stop without an id matches by name;
    - a quote's own id beats its places row's id.
- **B:**
  - The dry run listed 0002, and `--apply` dropped everything listed.
  - `users` went from 13 rows to 6 (4 accounts and the 2 quote authors). Both `source='user'` quotes were kept.
  - The C checkout then refused to migrate ("the database has applied 0002-drop-legacy.sql…").
  - `journey.spec`: 8 passed, and account deletion works without the old tables.
- **Empty database:** Tiger doesn't allow `CREATE DATABASE`, so the app's tables on the fork were dropped instead. Migrate then applied `schema.sql` and recorded both migrations as baseline without running them, and a second run found nothing pending.

### Review fixes and second rehearsal (2026-10-18)

A correctness review, a security review of these commits and a security pass over the whole PR found no high-severity issue. They did find the following, now fixed:

- **A:**
  - The runner sets `lock_timeout = 5s` per transaction and commits `schema.sql` together with the baseline.
  - It rejects misnamed or duplicate-numbered files, never echoes a malformed `DATABASE_URL`, and detects a new database by `public.users`.
  - 0001 tolerates interests that aren't JSON.
  - Account deletion also strips the person's quotes from other people's planned trips, and matches pending sign-up links exactly.
  - Trip pages show only quotes that are still shared.
  - `/photos` enforces the exact key shape.
  - The taste summary goes into prompts JSON-quoted.
- **C:**
  - Quotes:
    - One quote per trip, via `reflections.trip_id`. It is unique, finishing again updates it, and it is deleted with the trip.
    - Quotes match only on their own place id; older rows keep name matching.
    - At most one quote per author is shown per stop.
  - Learned phrases:
    - Opt-in: nothing is kept unless tapped.
    - Filtered server-side for sensitive topics.
    - Never re-suggested once forgotten, via `taste.forgotten`.
  - The deploy order changed: migrate before merging, because C's code reads the new columns on most pages.
- **Rehearsed again on fork `bkcpd8ekd7`, deleted afterwards:**
  - **A:** the migrated-account flow and `auth.spec` plus `journey.spec` (8 passed).
  - **C:** SQL checks for the upsert, the copied-quote cleanup, the shared-quote filter, the trip cascade and the forgotten list, plus the matching rules; then `auth.spec` plus `journey.spec` (8 passed, one phrase kept, merged and forgotten).
  - **B:** 0002, then `auth.spec` plus `journey.spec` (8 passed).
  - **Empty database:** baseline only.

### Combined release (2026-10-18)

- PRs #3 (C) and #4 (B) were merged into `feat/vision`, so PR #2 ships A, C and B in one deploy. The B code no longer reads the legacy tables, so deploying it early is safe; only the drop has to wait for the soak.
- `db:migrate --through NNNN` (ADR-0009) holds back later migrations, so the three moments stay apart within one release.
- With B's code live for the whole soak, account deletion would fail for the one old account that still has `experiences` and `profiles` rows: B's `deleteAccount` no longer deletes them, and their foreign keys to `users` block the delete. New `0002-detach-legacy.sql` drops those two keys right after the deploy, and the drop moved to `0003-drop-legacy.sql`.
- Production has no `taste` or `trips` tables yet, so `schema.sql` must run before the merge; the new code reads them on every signed-in page.
- **Rehearsed on fork `xiw1gyombb`, deleted afterwards:**
  - `--through 0000` applied `schema.sql` only and held back all three migrations.
  - `--through 0002` ran 0001 and 0002. The old account's deletion statements then succeeded (rolled back), leaving its 3 `experiences` rows orphaned until 0003.
  - A plain `--apply` ran 0003: the legacy tables were gone, both member quotes remained, and the 3 old accounts had taste rows.
- Fork `fuygwusnh0` ran the same stages and served as the local dev database for three agent-created test users and the recorded demo.
- **Agent QA fixes (2026-10-18):** the test users' 14 findings are fixed on this branch (2111439, 3e4fc91, bf9ae18, a29e3b9, cb67072):
  - the planner keeps the visiting order its copy describes, picks the branch of a chain nearest the other stops, and makes at most 8 paid geocodes a plan (22 before);
  - the drafted story mentions only checked-in places unless the note says otherwise;
  - the scrapbook shows the reviewed story, Share is there on desktop right after saving, and nothing is pre-picked;
  - smaller trip, tier-list and copy fixes.
  `auth.spec` and `journey.spec` passed (8 of 8 at phone size, and the journey at 1280×860) on fork `m5uf6cw9c7` at the post-deploy state (`--through 0002`), on the real map. The fork is deleted.

### Deploy sequence (Nick)

Run every command from `apps/web` on an up-to-date `feat/vision` (step 1) or `main` (steps 3 and 4).

1. **Before merging:** `npm run db:migrate -- --apply --through 0000`. This applies `schema.sql` only: it creates `taste`, `trips` and the other v1 tables and adds C's columns. The `main` code running in production ignores them.
2. **Merge PR #2** and let Workers Builds deploy `explorin-app` and `explorin-marketing`.
3. **Right after the deploy:** `npm run db:migrate -- --apply --through 0002`. 0001 moves the 3 old accounts onto the taste profile; it waits for the deploy because the old onboarding would undo it. 0002 detaches the legacy tables so account deletion keeps working. Then sign in and check that About-you shows your old interests.
4. **After a few days of soak:**
   - fork the Tiger service as a snapshot;
   - run `npm run db:migrate -- --apply` (0003 drops the legacy tables and columns; after this, redeploying the old `main` no longer works);
   - delete the snapshot fork once you're satisfied.
   - Don't run `db:migrate` from any branch cut before Release A after this: its old runner would re-create the dropped tables (ADR-0009).

## Nick's actions

- Merge PR #2 and deploy (web and marketing).
- Run `db:migrate` against production at the three points marked above.
- Sign in afterwards to check.
- Delete the `GOOGLE_MAPS_MAP_ID` secret if it exists.
- Turn off **Builds for Preview branches** for both Workers (Settings → Builds → Previews Base). Their `npx wrangler preview` step fails without a `previews` block, which would need preview-safe copies of the database, bucket and secrets.
- Delete the merged branches `feat/people-like-you` and `feat/drop-legacy` on GitHub.
- The rehearsal and QA forks are already deleted.
