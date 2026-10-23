-- ================================================================
-- EVENTS CALENDAR + MERCHANDISE SHOWCASE
-- Tourism Office admins publish local events (festivals, cultural
-- shows, markets) and advertise Daet merchandise (t-shirts, mugs,
-- souvenirs). The public can read published/active rows only.
-- ================================================================

-- ----------------------------------------------------------------
-- Events
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tours_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 3 AND 120),
  description TEXT CHECK (description IS NULL OR char_length(description) <= 2000),
  category TEXT NOT NULL DEFAULT 'other'
    CHECK (category IN ('festival', 'cultural', 'sports', 'religious', 'market', 'other')),
  venue TEXT NOT NULL CHECK (char_length(venue) BETWEEN 2 AND 160),
  organizer TEXT CHECK (organizer IS NULL OR char_length(organizer) <= 120),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  image_url TEXT,
  is_published BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tours_events_ends_after_start CHECK (ends_at >= starts_at)
);

CREATE INDEX IF NOT EXISTS idx_tours_events_starts_at ON tours_events(starts_at);
CREATE INDEX IF NOT EXISTS idx_tours_events_published ON tours_events(is_published, starts_at);

-- ----------------------------------------------------------------
-- Merchandise
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tours_merchandise (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  description TEXT CHECK (description IS NULL OR char_length(description) <= 1000),
  category TEXT NOT NULL DEFAULT 'souvenir'
    CHECK (category IN ('tshirt', 'mug', 'souvenir', 'accessory', 'pasalubong', 'other')),
  price NUMERIC(10, 2) CHECK (price IS NULL OR price >= 0),
  seller_name TEXT NOT NULL CHECK (char_length(seller_name) BETWEEN 2 AND 120),
  where_to_buy TEXT CHECK (where_to_buy IS NULL OR char_length(where_to_buy) <= 200),
  contact_info TEXT CHECK (contact_info IS NULL OR char_length(contact_info) <= 200),
  image_url TEXT,
  is_featured BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tours_merchandise_active ON tours_merchandise(is_active, is_featured DESC, created_at DESC);

-- ----------------------------------------------------------------
-- updated_at triggers
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION tours_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tours_events_updated_at ON tours_events;
CREATE TRIGGER trg_tours_events_updated_at
BEFORE UPDATE ON tours_events
FOR EACH ROW EXECUTE FUNCTION tours_touch_updated_at();

DROP TRIGGER IF EXISTS trg_tours_merchandise_updated_at ON tours_merchandise;
CREATE TRIGGER trg_tours_merchandise_updated_at
BEFORE UPDATE ON tours_merchandise
FOR EACH ROW EXECUTE FUNCTION tours_touch_updated_at();

-- ----------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------
ALTER TABLE tours_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE tours_merchandise ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view published events" ON tours_events;
CREATE POLICY "Public can view published events"
ON tours_events FOR SELECT
TO anon, authenticated
USING (is_published = true);

DROP POLICY IF EXISTS "Admins manage events" ON tours_events;
CREATE POLICY "Admins manage events"
ON tours_events FOR ALL
TO authenticated
USING (get_my_role() = 'admin')
WITH CHECK (get_my_role() = 'admin');

DROP POLICY IF EXISTS "Public can view active merchandise" ON tours_merchandise;
CREATE POLICY "Public can view active merchandise"
ON tours_merchandise FOR SELECT
TO anon, authenticated
USING (is_active = true);

DROP POLICY IF EXISTS "Admins manage merchandise" ON tours_merchandise;
CREATE POLICY "Admins manage merchandise"
ON tours_merchandise FOR ALL
TO authenticated
USING (get_my_role() = 'admin')
WITH CHECK (get_my_role() = 'admin');

-- ----------------------------------------------------------------
-- Public image bucket (admin write, public read)
-- ----------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('tours-promo-images', 'tours-promo-images', true, 5242880,
        ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public can view promo images" ON storage.objects;
CREATE POLICY "Public can view promo images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'tours-promo-images');

DROP POLICY IF EXISTS "Admins upload promo images" ON storage.objects;
CREATE POLICY "Admins upload promo images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'tours-promo-images' AND get_my_role() = 'admin');

DROP POLICY IF EXISTS "Admins delete promo images" ON storage.objects;
CREATE POLICY "Admins delete promo images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'tours-promo-images' AND get_my_role() = 'admin');
