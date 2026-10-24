-- F11: Events & merchandise follow-ups
-- 1. Events link to an attraction (F6) and record where their date came from.
-- 2. Approved operators submit merchandise; the Tourism Office approves it.
-- 3. Seed the dated 2026 events (sources in each row; undated ones are left
--    for the Tourism Office, see docs/FEATURE_PLAN.md F11).

-- ----------------------------------------------------------------
-- 1. Events ↔ attractions
-- ----------------------------------------------------------------
ALTER TABLE public.tours_events
  ADD COLUMN IF NOT EXISTS attraction_id uuid REFERENCES public.tours_attractions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source text CHECK (source IS NULL OR char_length(source) <= 300);
CREATE INDEX IF NOT EXISTS tours_events_attraction_idx ON public.tours_events (attraction_id);

-- ----------------------------------------------------------------
-- 2. Operator merchandise submissions
-- ----------------------------------------------------------------
ALTER TABLE public.tours_merchandise
  ADD COLUMN IF NOT EXISTS submitted_by_operator_id uuid REFERENCES public.tours_operators(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'approved' CHECK (review_status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS review_notes text CHECK (review_notes IS NULL OR char_length(review_notes) <= 300),
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
CREATE INDEX IF NOT EXISTS tours_merchandise_operator_idx ON public.tours_merchandise (submitted_by_operator_id);
CREATE INDEX IF NOT EXISTS tours_merchandise_pending_idx ON public.tours_merchandise (review_status) WHERE review_status = 'pending';

CREATE OR REPLACE FUNCTION public.tours_my_approved_operator_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT id FROM tours_operators WHERE profile_id = auth.uid() AND accreditation_status = 'approved' LIMIT 1;
$fn$;
REVOKE ALL ON FUNCTION public.tours_my_approved_operator_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tours_my_approved_operator_id() TO authenticated;

-- Public sees only active, approved products.
ALTER POLICY tours_merchandise_public_read ON public.tours_merchandise
  USING (is_active = true AND review_status = 'approved');

CREATE POLICY tours_merchandise_operator_read ON public.tours_merchandise
  FOR SELECT TO authenticated
  USING (submitted_by_operator_id IS NOT NULL AND submitted_by_operator_id = public.tours_my_approved_operator_id());
-- Operators submit (and re-submit after edits) as pending; they can never feature or approve.
CREATE POLICY tours_merchandise_operator_insert ON public.tours_merchandise
  FOR INSERT TO authenticated
  WITH CHECK (submitted_by_operator_id = public.tours_my_approved_operator_id()
    AND review_status = 'pending' AND is_featured = false AND created_by = auth.uid());
CREATE POLICY tours_merchandise_operator_update ON public.tours_merchandise
  FOR UPDATE TO authenticated
  USING (submitted_by_operator_id = public.tours_my_approved_operator_id())
  WITH CHECK (submitted_by_operator_id = public.tours_my_approved_operator_id()
    AND review_status = 'pending' AND is_featured = false);
CREATE POLICY tours_merchandise_operator_delete ON public.tours_merchandise
  FOR DELETE TO authenticated
  USING (submitted_by_operator_id = public.tours_my_approved_operator_id());

-- Review fields belong to the Tourism Office; notify on submit and on decision.
CREATE OR REPLACE FUNCTION public.tours_merch_review_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF public.get_my_role() IS DISTINCT FROM 'admin' AND NEW.submitted_by_operator_id IS NOT NULL THEN
      NEW.review_notes := NULL;
      NEW.reviewed_at := NULL;
    END IF;
    RETURN NEW;
  END IF;

  IF public.get_my_role() IS DISTINCT FROM 'admin' THEN
    NEW.review_notes := OLD.review_notes;
    NEW.reviewed_at := OLD.reviewed_at;
    NEW.submitted_by_operator_id := OLD.submitted_by_operator_id;
    NEW.created_by := OLD.created_by;
  ELSIF NEW.review_status IS DISTINCT FROM OLD.review_status AND NEW.review_status IN ('approved', 'rejected') THEN
    NEW.reviewed_at := now();
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.tours_merch_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_admin uuid;
  v_operator_profile uuid;
BEGIN
  IF NEW.submitted_by_operator_id IS NULL THEN
    RETURN NULL;
  END IF;
  IF NEW.review_status = 'pending' AND (TG_OP = 'INSERT' OR OLD.review_status IS DISTINCT FROM 'pending') THEN
    FOR v_admin IN SELECT id FROM profiles WHERE role = 'admin' LOOP
      PERFORM tours_notify(v_admin, 'merch_submitted', 'Product waiting for approval',
        format('%s by %s', NEW.name, NEW.seller_name), '/tours/admin/merch?show=pending');
    END LOOP;
  ELSIF TG_OP = 'UPDATE' AND NEW.review_status IS DISTINCT FROM OLD.review_status AND NEW.review_status IN ('approved', 'rejected') THEN
    SELECT profile_id INTO v_operator_profile FROM tours_operators WHERE id = NEW.submitted_by_operator_id;
    PERFORM tours_notify(v_operator_profile,
      CASE WHEN NEW.review_status = 'approved' THEN 'merch_approved' ELSE 'merch_rejected' END,
      CASE WHEN NEW.review_status = 'approved' THEN format('%s is now on the merch showcase', NEW.name) ELSE format('%s was not approved', NEW.name) END,
      NEW.review_notes, '/tours/operator/merch');
  END IF;
  RETURN NULL;
END;
$fn$;
REVOKE ALL ON FUNCTION public.tours_merch_review_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tours_merch_notify() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_tours_merch_review_guard BEFORE INSERT OR UPDATE ON public.tours_merchandise
  FOR EACH ROW EXECUTE FUNCTION public.tours_merch_review_guard();
CREATE TRIGGER trg_tours_merch_notify AFTER INSERT OR UPDATE OF review_status ON public.tours_merchandise
  FOR EACH ROW EXECUTE FUNCTION public.tours_merch_notify();

-- Operators upload product photos only into their own folder.
CREATE POLICY tours_promo_images_operator_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'tours-promo-images' AND public.get_my_role() = 'operator'
    AND name LIKE 'merch-submissions/' || auth.uid()::text || '/%');
CREATE POLICY tours_promo_images_operator_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'tours-promo-images' AND public.get_my_role() = 'operator'
    AND name LIKE 'merch-submissions/' || auth.uid()::text || '/%');

-- ----------------------------------------------------------------
-- 3. Seed dated 2026 events (Manila time). Idempotent by title + start.
-- ----------------------------------------------------------------
INSERT INTO public.tours_events (title, description, category, venue, organizer, starts_at, ends_at, is_published, source)
SELECT v.title, v.description, v.category, v.venue, v.organizer, v.starts_at, v.ends_at, true, v.source
FROM (VALUES
  ('Pinyasan Festival 2026',
   'Daet''s pineapple festival, held with the town fiesta of St. John the Baptist. The Tourism Office posts the day-by-day programme closer to the date.',
   'festival', 'Daet town proper', 'Municipality of Daet',
   timestamptz '2026-06-15 00:00+08', timestamptz '2026-06-24 23:59+08',
   'Tourism Promotions Board: tpb.gov.ph/events/pinyasan-festival (June 15–24)'),
  ('Undas 2026 (All Saints'' and All Souls'' Day)',
   'Families visit cemeteries across Daet to remember their loved ones. Expect heavy traffic near cemeteries and on the national road; plan tours around it.',
   'religious', 'Cemeteries across Daet', NULL,
   timestamptz '2026-11-01 00:00+08', timestamptz '2026-11-02 23:59+08',
   'Philippine holidays: All Saints'' Day (Nov 1) and All Souls'' Day (Nov 2)'),
  ('Simbang Gabi 2026',
   'Nine dawn Masses before Christmas, a Filipino tradition. Check your parish for Mass times.',
   'religious', 'Parish churches across Daet', NULL,
   timestamptz '2026-12-16 04:00+08', timestamptz '2026-12-24 06:00+08',
   'Catholic tradition: nine dawn Masses, December 16–24')
) AS v(title, description, category, venue, organizer, starts_at, ends_at, source)
WHERE NOT EXISTS (SELECT 1 FROM public.tours_events e WHERE e.title = v.title AND e.starts_at = v.starts_at);
