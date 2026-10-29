-- ================================================================
-- Daet local guide directory (messenger + AI guide, phase 1)
--
-- tours_guide_places: where to eat, stay, catch a ride, buy pasalubong,
-- meet, or get help. tours_fares: what a ride costs and how long it
-- takes. Both are curated by the Tourism Office: every row names its
-- source and the date it was checked, and unverified rows are shown to
-- travellers as "verify locally". Everyone reads active rows; admins
-- write. Tours also get an explicit meeting point.
-- ================================================================

CREATE TABLE IF NOT EXISTS public.tours_guide_places (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('eatery', 'lodging', 'terminal', 'pasalubong', 'meeting_point', 'service')),
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 80),
  description text CHECK (char_length(description) <= 1000),
  municipality text NOT NULL DEFAULT 'Daet' CHECK (char_length(municipality) BETWEEN 2 AND 60),
  address text CHECK (char_length(address) <= 200),
  latitude numeric(9, 6) CHECK (latitude BETWEEN -90 AND 90),
  longitude numeric(9, 6) CHECK (longitude BETWEEN -180 AND 180),
  location_verified boolean NOT NULL DEFAULT false,
  price_min numeric(10, 2) CHECK (price_min >= 0),
  price_max numeric(10, 2) CHECK (price_max >= 0),
  price_unit text CHECK (price_unit IN ('meal', 'night', 'trip', 'item')),
  specialties text[] NOT NULL DEFAULT '{}',
  tags text[] NOT NULL DEFAULT '{}',
  opening_hours jsonb CHECK (opening_hours IS NULL OR jsonb_typeof(opening_hours) = 'object'),
  phone text CHECK (char_length(phone) <= 40),
  source text NOT NULL CHECK (char_length(source) BETWEEN 3 AND 500),
  checked_on date NOT NULL DEFAULT current_date,
  verified boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tours_guide_places_coordinates_pair CHECK ((latitude IS NULL) = (longitude IS NULL)),
  CONSTRAINT tours_guide_places_price_order CHECK (price_min IS NULL OR price_max IS NULL OR price_min <= price_max),
  CONSTRAINT tours_guide_places_price_unit CHECK ((price_min IS NULL AND price_max IS NULL) OR price_unit IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_tours_guide_places_kind ON public.tours_guide_places (kind) WHERE is_active;

CREATE TABLE IF NOT EXISTS public.tours_fares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mode text NOT NULL CHECK (mode IN ('bus', 'van', 'jeepney', 'tricycle', 'boat', 'habal_habal', 'taxi', 'plane')),
  from_name text NOT NULL CHECK (char_length(from_name) BETWEEN 2 AND 80),
  to_name text NOT NULL CHECK (char_length(to_name) BETWEEN 2 AND 80),
  board_place_id uuid REFERENCES public.tours_guide_places(id) ON DELETE SET NULL,
  fare_min numeric(10, 2) CHECK (fare_min >= 0),
  fare_max numeric(10, 2) CHECK (fare_max >= 0),
  fare_per text NOT NULL DEFAULT 'person' CHECK (fare_per IN ('person', 'trip', 'boat')),
  minutes_min integer CHECK (minutes_min > 0),
  minutes_max integer CHECK (minutes_max > 0),
  schedule_note text CHECK (char_length(schedule_note) <= 300),
  source text NOT NULL CHECK (char_length(source) BETWEEN 3 AND 500),
  checked_on date NOT NULL DEFAULT current_date,
  verified boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tours_fares_fare_order CHECK (fare_min IS NULL OR fare_max IS NULL OR fare_min <= fare_max),
  CONSTRAINT tours_fares_minutes_order CHECK (minutes_min IS NULL OR minutes_max IS NULL OR minutes_min <= minutes_max)
);
-- One fare row per way of travel on a route.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tours_fares_route ON public.tours_fares (mode, lower(from_name), lower(to_name));

CREATE OR REPLACE FUNCTION public.tours_guide_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.tours_guide_touch() FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE TRIGGER trg_tours_guide_places_touch BEFORE UPDATE ON public.tours_guide_places
FOR EACH ROW EXECUTE FUNCTION public.tours_guide_touch();
CREATE OR REPLACE TRIGGER trg_tours_fares_touch BEFORE UPDATE ON public.tours_fares
FOR EACH ROW EXECUTE FUNCTION public.tours_guide_touch();

ALTER TABLE public.tours_guide_places ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tours_fares ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tours_guide_places, public.tours_fares FROM anon, authenticated;
GRANT SELECT ON public.tours_guide_places, public.tours_fares TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.tours_guide_places, public.tours_fares TO authenticated;

CREATE POLICY tours_guide_places_read ON public.tours_guide_places FOR SELECT TO anon, authenticated
  USING (is_active OR get_my_role() = 'admin');
CREATE POLICY tours_guide_places_admin_write ON public.tours_guide_places FOR ALL TO authenticated
  USING (get_my_role() = 'admin') WITH CHECK (get_my_role() = 'admin');
CREATE POLICY tours_fares_read ON public.tours_fares FOR SELECT TO anon, authenticated
  USING (is_active OR get_my_role() = 'admin');
CREATE POLICY tours_fares_admin_write ON public.tours_fares FOR ALL TO authenticated
  USING (get_my_role() = 'admin') WITH CHECK (get_my_role() = 'admin');

-- Where a tour's guests meet. Empty means "the first stop", as before.
ALTER TABLE public.tours_packages
  ADD COLUMN IF NOT EXISTS meeting_point_name text CHECK (char_length(meeting_point_name) <= 120),
  ADD COLUMN IF NOT EXISTS meeting_lat numeric(9, 6) CHECK (meeting_lat BETWEEN -90 AND 90),
  ADD COLUMN IF NOT EXISTS meeting_lng numeric(9, 6) CHECK (meeting_lng BETWEEN -180 AND 180),
  ADD COLUMN IF NOT EXISTS meeting_time time;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tours_packages_meeting_pair') THEN
    ALTER TABLE public.tours_packages
      ADD CONSTRAINT tours_packages_meeting_pair CHECK ((meeting_lat IS NULL) = (meeting_lng IS NULL));
  END IF;
END $$;

-- Operators set only the meeting point of their own tours through this
-- function, whatever the tour's review status: it changes no other field.
CREATE OR REPLACE FUNCTION public.tours_set_meeting_point(
  p_package_id uuid,
  p_name text,
  p_lat numeric,
  p_lng numeric,
  p_time time
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM tours_packages p
    JOIN tours_operators o ON o.id = p.operator_id
    WHERE p.id = p_package_id AND (o.profile_id = auth.uid() OR get_my_role() = 'admin')
  ) THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  UPDATE tours_packages
     SET meeting_point_name = NULLIF(btrim(p_name), ''),
         meeting_lat = p_lat,
         meeting_lng = p_lng,
         meeting_time = p_time
   WHERE id = p_package_id;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.tours_set_meeting_point(uuid, text, numeric, numeric, time) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tours_set_meeting_point(uuid, text, numeric, numeric, time) TO authenticated;
