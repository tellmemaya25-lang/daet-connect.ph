-- Tickets need full payment: a booking can be checked in only when it is
-- confirmed, paid in full and on its tour date. Same rule as checkInAllowed
-- and hasTicket in the app. Otherwise identical to the F3 definition.
CREATE OR REPLACE FUNCTION public.tours_check_in(p_booking_id uuid, p_participant_id uuid, p_method text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  IF b.payment_status IS DISTINCT FROM 'paid' THEN
    RAISE EXCEPTION 'This booking isn''t paid in full yet, so it can''t be checked in.' USING ERRCODE = 'check_violation';
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
$function$;
