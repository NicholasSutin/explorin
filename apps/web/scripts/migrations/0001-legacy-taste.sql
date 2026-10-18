-- Accounts that finished the pre-v1 onboarding have "onboardedAt" set but no taste row, so the planner runs without
-- a taste profile and Settings → Re-grade has nothing to grade. Copy their old interests into a taste row and clear
-- "onboardedAt": the guard then sends them through About-you (interests filled in) and the tier list once more.
-- Logins and sessions are untouched. Old interests are a JSON string holding an array; 'Food' became 'Food & drink'.
-- pg_input_is_valid needs Postgres 16+ (Tiger runs 18).
-- The list below is a snapshot of INTERESTS in src/lib/taste.ts. Once an account has a taste row it no longer matches.
-- Run right after the feat/vision deploy, not before: main's old onboarding would set "onboardedAt" again.
INSERT INTO users (id, name) SELECT id, name FROM "user" ON CONFLICT (id) DO NOTHING;

WITH legacy AS (
  SELECT u.id,
         CASE
           WHEN jsonb_typeof(u.interests) = 'array' THEN u.interests
           WHEN jsonb_typeof(u.interests) = 'string' AND pg_input_is_valid(u.interests #>> '{}', 'jsonb')
             THEN (u.interests #>> '{}')::jsonb
         END AS arr                          -- anything else (missing, not JSON, not a list) counts as no interests
  FROM "user" u
  WHERE u."onboardedAt" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM taste t WHERE t.user_id = u.id)
), ins AS (
  INSERT INTO taste (user_id, interests)
  SELECT l.id, ARRAY(
           SELECT m.name
           FROM jsonb_array_elements_text(CASE jsonb_typeof(l.arr) WHEN 'array' THEN l.arr ELSE '[]' END)
                  WITH ORDINALITY AS i(value, ord),
                LATERAL (SELECT CASE i.value WHEN 'Food' THEN 'Food & drink' ELSE i.value END AS name) AS m
           WHERE m.name = ANY ('{Nature,"Art & culture","Food & drink","Coffee & sweets",History,Architecture,Nightlife,Shopping,"Hidden gems","Slow moments","Something active",Photography}'::text[])
           GROUP BY m.name ORDER BY min(i.ord))
  FROM legacy l
  ON CONFLICT (user_id) DO NOTHING
  RETURNING user_id
)
UPDATE "user" SET "onboardedAt" = NULL, "updatedAt" = now() WHERE id IN (SELECT user_id FROM ins);
