CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS places (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  google_place_id text UNIQUE,
  name text NOT NULL UNIQUE,
  kind text,                      -- run_route | viewpoint | park | walk | food
  lat double precision, lng double precision,
  tags text[] DEFAULT '{}',       -- water_view, esb_view, atlantic, sunrise, quiet ...
  notes text,
  maps_url text,
  review_urls text[] DEFAULT '{}' -- optional Tripadvisor pages for ingest
);

CREATE TABLE IF NOT EXISTS reflections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id uuid REFERENCES places(id),
  author_id uuid REFERENCES users(id),
  source text NOT NULL,           -- user | public_review | tripadvisor_review | yelp_review | seed
  display_name text,              -- "Maya, runner" or "Google Maps reviewer"
  body text,
  quote text,                     -- one quotable sentence
  emotions text[] DEFAULT '{}', themes text[] DEFAULT '{}',
  photo_urls text[] DEFAULT '{}',
  consent_share boolean DEFAULT true,
  embedding vector(768),
  author_profile_embedding vector(768),   -- null for public reviews
  google_place_id text,           -- the exact Google place a member wrote about; places.name merges same-name branches
  created_at timestamptz DEFAULT now()
);
ALTER TABLE reflections ADD COLUMN IF NOT EXISTS google_place_id text;

CREATE INDEX IF NOT EXISTS reflections_place_idx ON reflections(place_id);

-- Accounts (better-auth, camelCase columns as it expects; uuid ids match users.id).
-- A row in "user" is mirrored into users(id, name) on creation (auth.ts) so taste, trips, usage and reflections can
-- reference it.
CREATE TABLE IF NOT EXISTS "user" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  "emailVerified" boolean NOT NULL DEFAULT false,
  image text,
  "homeCity" text,
  "onboardedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS session (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "expiresAt" timestamptz NOT NULL,
  token text NOT NULL UNIQUE,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "ipAddress" text,
  "userAgent" text,
  "userId" uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS session_user_idx ON session("userId");

CREATE TABLE IF NOT EXISTS account (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "accountId" text NOT NULL,
  "providerId" text NOT NULL,
  "userId" uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  scope text,
  password text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS account_user_idx ON account("userId");

CREATE TABLE IF NOT EXISTS verification (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier text NOT NULL,
  value text NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS verification_identifier_idx ON verification(identifier);

-- ---------------------------------------------------------------------------------------------------------------
-- Explorin v1: taste profile, trips, happenings geocode cache, usage ledger. Additive and idempotent like the rest.
-- Everything a person owns hangs off users(id) with ON DELETE CASCADE; src/lib/server/account.ts deletes the rest.
-- ---------------------------------------------------------------------------------------------------------------

-- What onboarding learns: the free-text blurb, broad interests, who they plan for, and the tier-list grades
-- ({ "<category id>": "S+" | "A+" | "A" | "B" | "C" | "NO" }). `summary` is a plain-language digest of all of it,
-- embedded so "people like you" can weigh quotes by taste. `offered` is which cards the tier list showed.
-- `learned` holds short phrases drawn from trip notes that the person kept (newest first, at most 8); `forgotten`
-- the ones they removed in Settings, so drafts don't suggest them again (at most 50).
CREATE TABLE IF NOT EXISTS taste (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  blurb text NOT NULL DEFAULT '',
  interests text[] NOT NULL DEFAULT '{}',
  audience text[] NOT NULL DEFAULT '{}',
  grades jsonb NOT NULL DEFAULT '{}',
  offered text[] NOT NULL DEFAULT '{}',
  summary text,
  embedding vector(768),
  flip_animations boolean NOT NULL DEFAULT true,
  learned text[] NOT NULL DEFAULT '{}',
  forgotten text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE taste ADD COLUMN IF NOT EXISTS learned text[] NOT NULL DEFAULT '{}';
ALTER TABLE taste ADD COLUMN IF NOT EXISTS forgotten text[] NOT NULL DEFAULT '{}';

-- One planned day. Stops live in trip_stops; happenings (NYC permitted events near the stops) are a snapshot.
CREATE TABLE IF NOT EXISTS trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  prompt text NOT NULL,
  city text NOT NULL,
  day_window text NOT NULL DEFAULT 'now',          -- now | morning | afternoon | evening | all_day
  title text,
  status text NOT NULL DEFAULT 'planned',          -- planned | active | finished
  happenings jsonb NOT NULL DEFAULT '[]',
  note text,
  photo_urls text[] NOT NULL DEFAULT '{}',
  best_for text[] NOT NULL DEFAULT '{}',
  best_for_options text[] NOT NULL DEFAULT '{}',
  story_title text,
  story text,
  emotions text[] NOT NULL DEFAULT '{}',
  highlight_stop_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS trips_user_idx ON trips(user_id, created_at DESC);

-- A stop on a trip. `data` is Explorin's own copy (AI title, reason, tags, category) plus the Google place id.
-- Google's terms allow storing place ids indefinitely and coordinates for up to 30 days, so `lat/lng` carry
-- `coords_at` and are refreshed from the place id when older (src/lib/server/trips.ts). Photos and reviews are
-- never stored; they are fetched by place id when shown. `visited_lat/lng` is the person's own GPS fix.
CREATE TABLE IF NOT EXISTS trip_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  position integer NOT NULL,
  google_place_id text,
  data jsonb NOT NULL,
  lat double precision,
  lng double precision,
  coords_at timestamptz,
  in_plan boolean NOT NULL DEFAULT true,
  added_by text NOT NULL DEFAULT 'ai',             -- ai | user
  visited_at timestamptz,
  visited_lat double precision,
  visited_lng double precision
);
CREATE INDEX IF NOT EXISTS trip_stops_trip_idx ON trip_stops(trip_id, position);

-- The reflection a finished trip's note became: one per trip (finishing again updates it), gone with the trip.
-- Declared here rather than in `reflections` above because it references trips.
ALTER TABLE reflections ADD COLUMN IF NOT EXISTS trip_id uuid REFERENCES trips(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS reflections_trip_idx ON reflections(trip_id);

-- Event-location text -> coordinates, shared across people (greenmarkets repeat weekly). Rows older than 30 days
-- are ignored and overwritten, which also keeps Google-geocoded coordinates inside their caching window.
CREATE TABLE IF NOT EXISTS geocode_cache (
  query text PRIMARY KEY,
  lat double precision,
  lng double precision,
  source text NOT NULL,                            -- geosearch | google | none
  fetched_at timestamptz NOT NULL DEFAULT now()
);

-- Every paid upstream call made on someone's behalf, priced at list rates (src/lib/server/pricing.ts).
-- 1 credit = $0.001. Settings shows the month's total; plans stop at MONTHLY_CREDITS.
CREATE TABLE IF NOT EXISTS usage_events (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service text NOT NULL,                           -- gemini | embedding | nimble | places | maps | geocoding
  operation text NOT NULL,
  units integer NOT NULL DEFAULT 1,
  cost_micros bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS usage_user_time_idx ON usage_events(user_id, created_at DESC);
