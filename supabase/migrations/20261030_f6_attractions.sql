-- ================================================================
-- F6: Daet attractions directory + route cache
--
-- tours_attractions is the public tourism dataset. Coordinates are
-- optional (a place can be listed before its pin is confirmed) and
-- location_verified marks pins checked by the Tourism Office. Every row
-- names its source. Admins manage rows; everyone reads active ones.
-- tours_route_cache stores Google Routes API results per leg; only the
-- server (service role) touches it.
-- ================================================================

CREATE TABLE IF NOT EXISTS public.tours_attractions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 80),
  category text NOT NULL CHECK (category IN ('beach', 'heritage', 'nature', 'food', 'adventure', 'shopping', 'religious', 'park')),
  description text CHECK (char_length(description) <= 2000),
  municipality text NOT NULL DEFAULT 'Daet' CHECK (char_length(municipality) BETWEEN 2 AND 60),
  address text CHECK (char_length(address) <= 200),
  latitude numeric(9, 6) CHECK (latitude BETWEEN -90 AND 90),
  longitude numeric(9, 6) CHECK (longitude BETWEEN -180 AND 180),
  location_verified boolean NOT NULL DEFAULT false,
  opening_hours jsonb CHECK (opening_hours IS NULL OR jsonb_typeof(opening_hours) = 'object'),
  hours_note text CHECK (char_length(hours_note) <= 200),
  dwell_minutes integer CHECK (dwell_minutes BETWEEN 5 AND 720),
  entrance_fee numeric(10, 2) CHECK (entrance_fee >= 0),
  photo_url text,
  source text NOT NULL CHECK (char_length(source) BETWEEN 3 AND 500),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tours_attractions_coordinates_pair CHECK ((latitude IS NULL) = (longitude IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_tours_attractions_category ON public.tours_attractions (category) WHERE is_active;

CREATE OR REPLACE FUNCTION public.tours_attractions_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;
CREATE OR REPLACE TRIGGER trg_tours_attractions_touch
BEFORE UPDATE ON public.tours_attractions
FOR EACH ROW EXECUTE FUNCTION public.tours_attractions_touch();

ALTER TABLE public.tours_attractions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tours_attractions FROM anon, authenticated;
GRANT SELECT ON public.tours_attractions TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.tours_attractions TO authenticated;
CREATE POLICY tours_attractions_public_read ON public.tours_attractions FOR SELECT TO anon, authenticated
  USING (is_active OR get_my_role() = 'admin');
CREATE POLICY tours_attractions_admin_write ON public.tours_attractions FOR ALL TO authenticated
  USING (get_my_role() = 'admin') WITH CHECK (get_my_role() = 'admin');

CREATE TABLE IF NOT EXISTS public.tours_route_cache (
  origin_key text NOT NULL,
  dest_key text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('drive', 'walk')),
  distance_m integer NOT NULL CHECK (distance_m >= 0),
  duration_s integer NOT NULL CHECK (duration_s >= 0),
  polyline text,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (origin_key, dest_key, mode)
);
ALTER TABLE public.tours_route_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tours_route_cache FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tours_attractions_touch() FROM PUBLIC, anon, authenticated;
