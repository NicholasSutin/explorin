-- Retire what the pre-v1 flows left behind (plan: docs/plans/finish-vision-revamp.md, Release B). Run only after the
-- code that no longer touches these is deployed, and after a Tiger fork has been taken: there is no way back to the
-- `main` of 2026-10-17 once this has run.
-- Kept: the two member-written quotes (reflections with source = 'user') and their authors' users rows.
ALTER TABLE reflections DROP COLUMN IF EXISTS experience_id;      -- drops its foreign key to experiences with it
DROP TABLE IF EXISTS experiences, profiles, response_cache;
ALTER TABLE places DROP COLUMN IF EXISTS live, DROP COLUMN IF EXISTS live_at;
ALTER TABLE "user" DROP COLUMN IF EXISTS interests;               -- copied into taste by 0001-legacy-taste.sql

-- users rows from guest browsers (2026-10-11 cookie ids) that nothing references any more.
DELETE FROM users x
WHERE NOT EXISTS (SELECT 1 FROM "user" u WHERE u.id = x.id)
  AND NOT EXISTS (SELECT 1 FROM reflections r WHERE r.author_id = x.id)
  AND NOT EXISTS (SELECT 1 FROM taste t WHERE t.user_id = x.id)
  AND NOT EXISTS (SELECT 1 FROM trips t WHERE t.user_id = x.id)
  AND NOT EXISTS (SELECT 1 FROM usage_events e WHERE e.user_id = x.id);
