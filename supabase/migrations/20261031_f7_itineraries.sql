-- ================================================================
-- F7: Itinerary planner storage
--
-- Extends the existing tours_itineraries / tours_itinerary_items so a saved
-- plan keeps what the planner produced (attraction, end time, travel, cost,
-- lunch breaks, tips) and can be shared read-only by link. Anonymous users
-- lose the full table grants they had; owners manage their own plans.
-- ================================================================

ALTER TABLE public.tours_itineraries
  ADD COLUMN IF NOT EXISTS preferences jsonb,
  ADD COLUMN IF NOT EXISTS summary text CHECK (char_length(summary) <= 600),
  ADD COLUMN IF NOT EXISTS plan_source text NOT NULL DEFAULT 'rules' CHECK (plan_source IN ('rules', 'llm')),
  ADD COLUMN IF NOT EXISTS share_token uuid UNIQUE;

ALTER TABLE public.tours_itinerary_items
  ADD COLUMN IF NOT EXISTS attraction_id uuid REFERENCES public.tours_attractions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS item_kind text NOT NULL DEFAULT 'visit' CHECK (item_kind IN ('visit', 'lunch')),
  ADD COLUMN IF NOT EXISTS end_time time,
  ADD COLUMN IF NOT EXISTS travel_minutes integer CHECK (travel_minutes >= 0),
  ADD COLUMN IF NOT EXISTS cost numeric(10, 2) CHECK (cost >= 0),
  ADD COLUMN IF NOT EXISTS tip text CHECK (char_length(tip) <= 240);
CREATE INDEX IF NOT EXISTS idx_tours_itinerary_items_itinerary ON public.tours_itinerary_items (itinerary_id, day_number, item_order);

REVOKE ALL ON public.tours_itineraries FROM anon;
REVOKE ALL ON public.tours_itinerary_items FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.tours_itineraries FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.tours_itinerary_items FROM authenticated;
ALTER POLICY "Tourist manages own itineraries" ON public.tours_itineraries TO authenticated;
ALTER POLICY "Admin views all itineraries" ON public.tours_itineraries TO authenticated;
ALTER POLICY "Tourist manages own itinerary items" ON public.tours_itinerary_items TO authenticated;

CREATE OR REPLACE FUNCTION public.tours_touch_itinerary()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;
CREATE OR REPLACE TRIGGER trg_tours_itineraries_touch
BEFORE UPDATE ON public.tours_itineraries
FOR EACH ROW EXECUTE FUNCTION public.tours_touch_itinerary();

-- Read-only view of a shared plan (anyone with the link). Returns null for
-- unknown tokens; never exposes the owner.
CREATE OR REPLACE FUNCTION public.tours_shared_itinerary(p_token uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT jsonb_build_object(
    'title', i.title, 'start_date', i.start_date, 'end_date', i.end_date, 'summary', i.summary,
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'day_number', it.day_number, 'item_order', it.item_order, 'kind', it.item_kind,
        'location_name', it.location_name, 'description', it.description, 'tip', it.tip,
        'latitude', it.latitude, 'longitude', it.longitude,
        'start_time', it.start_time, 'end_time', it.end_time, 'travel_minutes', it.travel_minutes,
        'attraction_slug', a.slug
      ) ORDER BY it.day_number, it.item_order)
      FROM tours_itinerary_items it LEFT JOIN tours_attractions a ON a.id = it.attraction_id AND a.is_active
      WHERE it.itinerary_id = i.id
    ), '[]'::jsonb)
  )
  FROM tours_itineraries i
  WHERE p_token IS NOT NULL AND i.share_token = p_token;
$fn$;

REVOKE EXECUTE ON FUNCTION public.tours_shared_itinerary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tours_shared_itinerary(uuid) TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tours_touch_itinerary() FROM PUBLIC, anon, authenticated;
