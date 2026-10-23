-- ================================================================
-- F3: Signed QR badge verification, booking tickets and check-in
--
-- Tokens are signed and checked by the app (src/lib/tours/qr-token.ts);
-- the database only answers "what is this guide's current status" and
-- records check-ins under the same rules as checkInAllowed():
--   - booking is confirmed and the tour date is today (Manila);
--   - caller is the booking's assigned approved guide, its approved
--     operator, or an admin;
--   - each participant (or the whole party, participant_id NULL) is
--     checked in once; repeating a scan is harmless.
-- ================================================================

-- ----------------------------------------------------------------
-- 1. Check-ins
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tours_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.tours_bookings(id) ON DELETE CASCADE,
  participant_id uuid REFERENCES public.tours_booking_participants(id) ON DELETE CASCADE,
  guide_id uuid REFERENCES public.tours_guides(id),
  checked_in_by uuid NOT NULL,
  method text NOT NULL CHECK (method IN ('qr', 'manual')),
  scanned_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tours_checkins_once UNIQUE NULLS NOT DISTINCT (booking_id, participant_id)
);
CREATE INDEX IF NOT EXISTS idx_tours_checkins_booking ON public.tours_checkins (booking_id);

ALTER TABLE public.tours_checkins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tours_checkins FROM anon, authenticated;
GRANT SELECT ON public.tours_checkins TO authenticated;

CREATE POLICY tours_checkins_select ON public.tours_checkins FOR SELECT TO authenticated
  USING (
    public.tours_is_booking_tourist(booking_id) OR public.tours_is_booking_operator(booking_id)
    OR public.tours_is_booking_guide(booking_id) OR get_my_role() = 'admin'
  );

-- ----------------------------------------------------------------
-- 2. Check-in (writes only through this function)
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tours_check_in(p_booking_id uuid, p_participant_id uuid, p_method text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  b tours_bookings%ROWTYPE;
  v_today date := (now() AT TIME ZONE 'Asia/Manila')::date;
  v_guide_id uuid;
  v_rows int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to check guests in.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_method NOT IN ('qr', 'manual') THEN
    RAISE EXCEPTION 'Unknown check-in method.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO b FROM tours_bookings WHERE id = p_booking_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found.' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT g.id INTO v_guide_id FROM tours_guides g
   WHERE g.id = b.assigned_guide_id AND g.profile_id = auth.uid() AND g.accreditation_status = 'approved';
  IF v_guide_id IS NULL AND NOT (
    get_my_role() = 'admin'
    OR (public.tours_is_booking_operator(b.id)
        AND EXISTS (SELECT 1 FROM tours_operators WHERE profile_id = auth.uid() AND accreditation_status = 'approved'))
  ) THEN
    RAISE EXCEPTION 'Only the guide assigned to this tour can check guests in.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF b.status <> 'confirmed' THEN
    RAISE EXCEPTION '%', CASE WHEN b.status = 'pending' THEN 'This booking is not confirmed yet.' ELSE 'This booking is ' || b.status || '.' END
      USING ERRCODE = 'check_violation';
  END IF;
  IF b.tour_date > v_today THEN
    RAISE EXCEPTION 'Check-in opens on the tour date.' USING ERRCODE = 'check_violation';
  ELSIF b.tour_date < v_today THEN
    RAISE EXCEPTION 'This tour date has passed.' USING ERRCODE = 'check_violation';
  END IF;

  IF p_participant_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM tours_booking_participants WHERE id = p_participant_id AND booking_id = b.id
  ) THEN
    RAISE EXCEPTION 'That guest is not on this booking.' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO tours_checkins (booking_id, participant_id, guide_id, checked_in_by, method)
  VALUES (b.id, p_participant_id, COALESCE(v_guide_id, b.assigned_guide_id), auth.uid(), p_method)
  ON CONFLICT ON CONSTRAINT tours_checkins_once DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN CASE WHEN v_rows = 1 THEN 'checked_in' ELSE 'already' END;
END;
$fn$;

-- ----------------------------------------------------------------
-- 3. Public badge lookup for /tours/verify (the app checks the token
--    signature first). Name and photo only for approved guides; signed-in
--    scans are logged in tours_qr_scan_logs.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tours_badge_lookup(p_guide_id uuid)
RETURNS TABLE (status text, full_name text, photo_url text, approved_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  g tours_guides%ROWTYPE;
BEGIN
  SELECT * INTO g FROM tours_guides WHERE id = p_guide_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::text, NULL::text, NULL::timestamptz;
    RETURN;
  END IF;

  IF auth.uid() IS NOT NULL THEN
    INSERT INTO tours_qr_scan_logs (guide_id, scanned_by, revealed_full_id) VALUES (g.id, auth.uid(), false);
  END IF;

  IF g.accreditation_status <> 'approved' THEN
    RETURN QUERY SELECT g.accreditation_status::text, NULL::text, NULL::text, NULL::timestamptz;
    RETURN;
  END IF;
  RETURN QUERY
    SELECT 'approved'::text, p.full_name, g.photo_url, COALESCE(g.reviewed_at, g.updated_at)
    FROM profiles p WHERE p.id = g.profile_id;
END;
$fn$;

-- ----------------------------------------------------------------
-- 4. Function privileges
-- ----------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.tours_check_in(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tours_check_in(uuid, uuid, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.tours_badge_lookup(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tours_badge_lookup(uuid) TO anon, authenticated;
