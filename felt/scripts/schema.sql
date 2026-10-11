CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id),
  traits jsonb NOT NULL,
  summary text,
  embedding vector(768),
  updated_at timestamptz DEFAULT now()
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
  review_urls text[] DEFAULT '{}', -- optional Tripadvisor pages for ingest
  live jsonb,                     -- cached Nimble live info (rating, status, ...)
  live_at timestamptz
);
ALTER TABLE places ADD COLUMN IF NOT EXISTS live jsonb;
ALTER TABLE places ADD COLUMN IF NOT EXISTS live_at timestamptz;

CREATE TABLE IF NOT EXISTS experiences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id),
  place_id uuid REFERENCES places(id),
  prompt text,
  status text DEFAULT 'recommended',   -- recommended | started | finished
  started_at timestamptz, finished_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reflections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id uuid REFERENCES places(id),
  experience_id uuid REFERENCES experiences(id),
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
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reflections_place_idx ON reflections(place_id);
CREATE INDEX IF NOT EXISTS experiences_user_idx ON experiences(user_id);

CREATE TABLE IF NOT EXISTS response_cache (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  created_at timestamptz DEFAULT now()
);
