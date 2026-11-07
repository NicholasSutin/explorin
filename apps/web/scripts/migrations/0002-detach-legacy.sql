-- Keep account deletion working while the pre-v1 tables wait for 0003-drop-legacy.sql (plan:
-- docs/plans/finish-vision-revamp.md, Release B). The deployed code no longer deletes their rows, so these foreign keys
-- would make deleting the one old account that still has rows there fail. Runs right after the deploy, with 0001; no
-- code reads through these keys, so the `main` of 2026-10-17 still works if it has to be redeployed.
ALTER TABLE IF EXISTS experiences DROP CONSTRAINT IF EXISTS experiences_user_id_fkey;
ALTER TABLE IF EXISTS profiles DROP CONSTRAINT IF EXISTS profiles_user_id_fkey;
