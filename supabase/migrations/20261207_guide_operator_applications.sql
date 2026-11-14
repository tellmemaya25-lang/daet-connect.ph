-- Guides apply to work with an operator (owner's request):
--   apply -> interview (scheduled in the app, guide confirms) -> passed / declined
--   -> operator offers a % of the tour price -> guide accepts (active) or declines.
-- Once active, the guide can be assigned to that operator's tours; only then.
-- Either side can end the agreement; the operator can offer a new % later,
-- which takes effect when the guide accepts it.
--
-- Pay: an active guide's fee on a tour is their agreed % of the tour price
-- (the booking total without the pickup fee). It replaces the package's fixed
-- guide fee. Pairs carried over from before this change (see the end) have no
-- % yet and keep the package's fixed fee until a % is agreed.
--
-- Every assignment path (operator, admin, swaps, automatic) goes through the
-- guide-fee trigger, so the "works with this operator" rule is checked there.

CREATE TABLE IF NOT EXISTS public.tours_guide_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guide_id uuid NOT NULL REFERENCES public.tours_guides(id) ON DELETE CASCADE,
  operator_id uuid NOT NULL REFERENCES public.tours_operators(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'applied' CHECK (status IN (
    'applied', 'interview_scheduled', 'interview_passed', 'offered', 'active',
    'rejected', 'offer_declined', 'withdrawn', 'ended'
  )),
  message text CHECK (char_length(message) <= 1000),
  interview_at timestamptz,
  interview_place text CHECK (char_length(interview_place) <= 200),
  interview_link text CHECK (char_length(interview_link) <= 500),
  interview_confirmed_at timestamptz,
  interview_notes text CHECK (char_length(interview_notes) <= 1000),
  -- The agreed share while active; NULL for a carried-over pair (fixed fee until agreed).
  revenue_share_pct numeric(5,2) CHECK (revenue_share_pct > 0 AND revenue_share_pct <= 100),
  -- A share the operator offered that the guide hasn't answered yet.
  offered_share_pct numeric(5,2) CHECK (offered_share_pct > 0 AND offered_share_pct <= 100),
  offered_at timestamptz,
  accepted_at timestamptz,
  decided_note text CHECK (char_length(decided_note) <= 500),
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (guide_id, operator_id)
);
CREATE INDEX IF NOT EXISTS tours_guide_applications_operator_idx ON public.tours_guide_applications (operator_id, status);

ALTER TABLE public.tours_guide_applications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tours_guide_applications FROM anon, authenticated;
GRANT SELECT ON public.tours_guide_applications TO authenticated;
DROP POLICY IF EXISTS tours_guide_applications_read ON public.tours_guide_applications;
-- The guide, the operator and admins read it; every change goes through the functions below.
CREATE POLICY tours_guide_applications_read ON public.tours_guide_applications
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM tours_guides g WHERE g.id = guide_id AND g.profile_id = auth.uid())
    OR public.tours_is_my_operator(operator_id)
    OR get_my_role() = 'admin'
  );

/** True when the guide has an active agreement with the operator. */
CREATE OR REPLACE FUNCTION public.tours_guide_works_for(p_guide uuid, p_operator uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (SELECT 1 FROM tours_guide_applications a WHERE a.guide_id = p_guide AND a.operator_id = p_operator AND a.status = 'active');
$$;
REVOKE ALL ON FUNCTION public.tours_guide_works_for(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tours_guide_works_for(uuid, uuid) TO authenticated;

-- Helpers for the functions below -------------------------------------------

/** The caller's approved guide row, or an error. */
CREATE OR REPLACE FUNCTION public.tours_my_approved_guide_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v uuid;
BEGIN
  SELECT id INTO v FROM tours_guides WHERE profile_id = auth.uid() AND accreditation_status = 'approved' LIMIT 1;
  IF v IS NULL THEN
    RAISE EXCEPTION 'Only guides approved by the Tourism Office can do this.' USING ERRCODE = '42501';
  END IF;
  RETURN v;
END;
$$;
REVOKE ALL ON FUNCTION public.tours_my_approved_guide_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tours_my_approved_guide_id() TO authenticated;

/** The application, locked, if the caller is its operator. */
CREATE OR REPLACE FUNCTION public.tours_operator_application(p_id uuid)
RETURNS tours_guide_applications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  a tours_guide_applications%ROWTYPE;
BEGIN
  SELECT * INTO a FROM tours_guide_applications WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR a.operator_id IS DISTINCT FROM tours_my_approved_operator_id() THEN
    RAISE EXCEPTION 'Application not found.' USING ERRCODE = '42501';
  END IF;
  RETURN a;
END;
$$;
REVOKE ALL ON FUNCTION public.tours_operator_application(uuid) FROM PUBLIC, anon, authenticated;

/** The application, locked, if the caller is its guide. */
CREATE OR REPLACE FUNCTION public.tours_guide_application(p_id uuid)
RETURNS tours_guide_applications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  a tours_guide_applications%ROWTYPE;
BEGIN
  SELECT * INTO a FROM tours_guide_applications WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM tours_guides g WHERE g.id = a.guide_id AND g.profile_id = auth.uid()) THEN
    RAISE EXCEPTION 'Application not found.' USING ERRCODE = '42501';
  END IF;
  RETURN a;
END;
$$;
REVOKE ALL ON FUNCTION public.tours_guide_application(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.tours_application_notify_guide(a tours_guide_applications, p_title text, p_body text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT tours_notify((SELECT profile_id FROM tours_guides WHERE id = a.guide_id), 'guide_application', p_title, p_body, '/tours/guide/operators');
$$;
REVOKE ALL ON FUNCTION public.tours_application_notify_guide(tours_guide_applications, text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.tours_application_notify_operator(a tours_guide_applications, p_title text, p_body text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT tours_notify((SELECT profile_id FROM tours_operators WHERE id = a.operator_id), 'guide_application', p_title, p_body, '/tours/operator/guides');
$$;
REVOKE ALL ON FUNCTION public.tours_application_notify_operator(tours_guide_applications, text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.tours_guide_name(p_guide uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(NULLIF(btrim(p.full_name), ''), 'A guide') FROM tours_guides g LEFT JOIN profiles p ON p.id = g.profile_id WHERE g.id = p_guide;
$$;
REVOKE ALL ON FUNCTION public.tours_guide_name(uuid) FROM PUBLIC, anon, authenticated;

-- Guide actions --------------------------------------------------------------

/** A guide applies to an operator (again, after a past application closed). */
CREATE OR REPLACE FUNCTION public.tours_guide_apply(p_operator_id uuid, p_message text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_guide uuid := tours_my_approved_guide_id();
  a tours_guide_applications%ROWTYPE;
  v_message text := NULLIF(btrim(COALESCE(p_message, '')), '');
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tours_operators WHERE id = p_operator_id AND accreditation_status = 'approved') THEN
    RAISE EXCEPTION 'That operator is not taking applications.' USING ERRCODE = 'check_violation';
  END IF;
  IF char_length(v_message) > 1000 THEN
    RAISE EXCEPTION 'Keep your message under 1,000 characters.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO a FROM tours_guide_applications WHERE guide_id = v_guide AND operator_id = p_operator_id FOR UPDATE;
  IF FOUND THEN
    IF a.status NOT IN ('rejected', 'offer_declined', 'withdrawn', 'ended') THEN
      RAISE EXCEPTION 'You already have an application with this operator.' USING ERRCODE = 'unique_violation';
    END IF;
    UPDATE tours_guide_applications
       SET status = 'applied', message = v_message, interview_at = NULL, interview_place = NULL, interview_link = NULL,
           interview_confirmed_at = NULL, interview_notes = NULL, revenue_share_pct = NULL, offered_share_pct = NULL,
           offered_at = NULL, accepted_at = NULL, decided_note = NULL, ended_at = NULL, created_at = now(), updated_at = now()
     WHERE id = a.id
     RETURNING * INTO a;
  ELSE
    INSERT INTO tours_guide_applications (guide_id, operator_id, message)
    VALUES (v_guide, p_operator_id, v_message)
    RETURNING * INTO a;
  END IF;
  PERFORM tours_application_notify_operator(a, 'New guide application', tours_guide_name(v_guide) || ' applied to guide your tours. Set up an interview.');
  RETURN a.id;
END;
$$;
REVOKE ALL ON FUNCTION public.tours_guide_apply(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tours_guide_apply(uuid, text) TO authenticated;

/** The guide withdraws an application that isn't active yet. */
CREATE OR REPLACE FUNCTION public.tours_guide_withdraw_application(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  a tours_guide_applications%ROWTYPE := tours_guide_application(p_id);
BEGIN
  IF a.status NOT IN ('applied', 'interview_scheduled', 'interview_passed', 'offered') THEN
    RAISE EXCEPTION 'This application can no longer be withdrawn.' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE tours_guide_applications SET status = 'withdrawn', offered_share_pct = NULL, updated_at = now() WHERE id = p_id RETURNING * INTO a;
  PERFORM tours_application_notify_operator(a, 'Application withdrawn', tours_guide_name(a.guide_id) || ' withdrew their application.');
END;
$$;
REVOKE ALL ON FUNCTION public.tours_guide_withdraw_application(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tours_guide_withdraw_application(uuid) TO authenticated;

/** The guide confirms they'll attend the interview. */
CREATE OR REPLACE FUNCTION public.tours_guide_confirm_interview(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  a tours_guide_applications%ROWTYPE := tours_guide_application(p_id);
BEGIN
  IF a.status <> 'interview_scheduled' THEN
    RAISE EXCEPTION 'There is no interview to confirm.' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE tours_guide_applications SET interview_confirmed_at = now(), updated_at = now() WHERE id = p_id RETURNING * INTO a;
  PERFORM tours_application_notify_operator(a, 'Interview confirmed', tours_guide_name(a.guide_id) || ' will attend the interview.');
END;
$$;
REVOKE ALL ON FUNCTION public.tours_guide_confirm_interview(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tours_guide_confirm_interview(uuid) TO authenticated;

/** The guide accepts or declines the operator's offered share (a first offer, or a new one while active). */
CREATE OR REPLACE FUNCTION public.tours_guide_respond_offer(p_id uuid, p_accept boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  a tours_guide_applications%ROWTYPE := tours_guide_application(p_id);
  v_pct text;
BEGIN
  IF a.offered_share_pct IS NULL OR a.status NOT IN ('offered', 'active') THEN
    RAISE EXCEPTION 'There is no offer to answer.' USING ERRCODE = 'check_violation';
  END IF;
  v_pct := trim(trailing '.' FROM trim(trailing '0' FROM a.offered_share_pct::text)) || '%';
  IF p_accept THEN
    UPDATE tours_guide_applications
       SET status = 'active', revenue_share_pct = offered_share_pct, offered_share_pct = NULL, accepted_at = now(), updated_at = now()
     WHERE id = p_id RETURNING * INTO a;
    PERFORM tours_application_notify_operator(a, 'Offer accepted', tours_guide_name(a.guide_id) || ' accepted ' || v_pct || ' of the tour price. You can now assign them to your tours.');
  ELSIF a.status = 'offered' THEN
    UPDATE tours_guide_applications SET status = 'offer_declined', offered_share_pct = NULL, updated_at = now() WHERE id = p_id RETURNING * INTO a;
    PERFORM tours_application_notify_operator(a, 'Offer declined', tours_guide_name(a.guide_id) || ' declined ' || v_pct || '. You can offer a different share.');
  ELSE
    -- Declining a new share keeps the current agreement.
    UPDATE tours_guide_applications SET offered_share_pct = NULL, updated_at = now() WHERE id = p_id RETURNING * INTO a;
    PERFORM tours_application_notify_operator(a, 'New share declined', tours_guide_name(a.guide_id) || ' declined ' || v_pct || '. Your current agreement stays.');
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.tours_guide_respond_offer(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tours_guide_respond_offer(uuid, boolean) TO authenticated;

-- Operator actions -----------------------------------------------------------

/** The operator sets (or moves) the interview: a future time, and a place or an online link. */
CREATE OR REPLACE FUNCTION public.tours_operator_schedule_interview(p_id uuid, p_at timestamptz, p_place text, p_link text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  a tours_guide_applications%ROWTYPE := tours_operator_application(p_id);
  v_place text := NULLIF(btrim(COALESCE(p_place, '')), '');
  v_link text := NULLIF(btrim(COALESCE(p_link, '')), '');
BEGIN
  IF a.status NOT IN ('applied', 'interview_scheduled') THEN
    RAISE EXCEPTION 'An interview can only be set for a new application.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_at IS NULL OR p_at <= now() THEN
    RAISE EXCEPTION 'Pick a time in the future.' USING ERRCODE = 'check_violation';
  END IF;
  IF v_place IS NULL AND v_link IS NULL THEN
    RAISE EXCEPTION 'Add a place or an online meeting link.' USING ERRCODE = 'check_violation';
  END IF;
  IF v_link IS NOT NULL AND v_link !~* '^https://' THEN
    RAISE EXCEPTION 'The meeting link must start with https://' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE tours_guide_applications
     SET status = 'interview_scheduled', interview_at = p_at, interview_place = v_place, interview_link = v_link,
         interview_confirmed_at = NULL, updated_at = now()
   WHERE id = p_id RETURNING * INTO a;
  PERFORM tours_application_notify_guide(a, 'Interview scheduled',
    (SELECT business_name FROM tours_operators WHERE id = a.operator_id) || ' set your interview for '
    || to_char(p_at AT TIME ZONE 'Asia/Manila', 'Mon FMDD, FMHH12:MI AM') || '. Please confirm.');
END;
$$;
REVOKE ALL ON FUNCTION public.tours_operator_schedule_interview(uuid, timestamptz, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tours_operator_schedule_interview(uuid, timestamptz, text, text) TO authenticated;

/** After the interview the operator records the result; a pass leads to an offer. */
CREATE OR REPLACE FUNCTION public.tours_operator_record_interview(p_id uuid, p_passed boolean, p_notes text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  a tours_guide_applications%ROWTYPE := tours_operator_application(p_id);
  v_op text;
BEGIN
  IF a.status <> 'interview_scheduled' THEN
    RAISE EXCEPTION 'Schedule the interview first.' USING ERRCODE = 'check_violation';
  END IF;
  IF char_length(p_notes) > 1000 THEN
    RAISE EXCEPTION 'Keep notes under 1,000 characters.' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE tours_guide_applications
     SET status = CASE WHEN p_passed THEN 'interview_passed' ELSE 'rejected' END,
         interview_notes = NULLIF(btrim(COALESCE(p_notes, '')), ''), updated_at = now()
   WHERE id = p_id RETURNING * INTO a;
  v_op := (SELECT business_name FROM tours_operators WHERE id = a.operator_id);
  IF p_passed THEN
    PERFORM tours_application_notify_guide(a, 'You passed the interview', v_op || ' will send you an offer for your share of the tour price.');
  ELSE
    PERFORM tours_application_notify_guide(a, 'Application not accepted', v_op || ' did not accept your application this time.');
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.tours_operator_record_interview(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tours_operator_record_interview(uuid, boolean, text) TO authenticated;

/** The operator declines an open application, with an optional note to the guide. */
CREATE OR REPLACE FUNCTION public.tours_operator_decline_application(p_id uuid, p_note text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  a tours_guide_applications%ROWTYPE := tours_operator_application(p_id);
  v_note text := NULLIF(btrim(COALESCE(p_note, '')), '');
BEGIN
  IF a.status NOT IN ('applied', 'interview_scheduled', 'interview_passed', 'offered', 'offer_declined') THEN
    RAISE EXCEPTION 'This application is already closed.' USING ERRCODE = 'check_violation';
  END IF;
  IF char_length(v_note) > 500 THEN
    RAISE EXCEPTION 'Keep the note under 500 characters.' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE tours_guide_applications SET status = 'rejected', offered_share_pct = NULL, decided_note = v_note, updated_at = now() WHERE id = p_id RETURNING * INTO a;
  PERFORM tours_application_notify_guide(a, 'Application not accepted',
    (SELECT business_name FROM tours_operators WHERE id = a.operator_id) || ' did not accept your application.' || COALESCE(' ' || v_note, ''));
END;
$$;
REVOKE ALL ON FUNCTION public.tours_operator_decline_application(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tours_operator_decline_application(uuid, text) TO authenticated;

/**
 * The operator offers the guide a % of the tour price: after a passed
 * interview, after a declined offer, or a new share for an active guide
 * (the current share stays until the guide accepts the new one).
 */
CREATE OR REPLACE FUNCTION public.tours_operator_offer_share(p_id uuid, p_pct numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  a tours_guide_applications%ROWTYPE := tours_operator_application(p_id);
  v_pct numeric := round(p_pct, 2);
BEGIN
  IF a.status NOT IN ('interview_passed', 'offered', 'offer_declined', 'active') THEN
    RAISE EXCEPTION 'Interview the guide before making an offer.' USING ERRCODE = 'check_violation';
  END IF;
  IF v_pct IS NULL OR v_pct <= 0 OR v_pct > 100 THEN
    RAISE EXCEPTION 'The share must be more than 0%% and at most 100%%.' USING ERRCODE = 'check_violation';
  END IF;
  IF a.status = 'active' AND a.revenue_share_pct = v_pct THEN
    RAISE EXCEPTION 'That is already the agreed share.' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE tours_guide_applications
     SET status = CASE WHEN status = 'active' THEN 'active' ELSE 'offered' END,
         offered_share_pct = v_pct, offered_at = now(), updated_at = now()
   WHERE id = p_id RETURNING * INTO a;
  PERFORM tours_application_notify_guide(a, CASE WHEN a.status = 'active' THEN 'New share offered' ELSE 'You have an offer' END,
    (SELECT business_name FROM tours_operators WHERE id = a.operator_id) || ' offers you '
    || trim(trailing '.' FROM trim(trailing '0' FROM v_pct::text)) || '% of the tour price. Accept or decline it.');
END;
$$;
REVOKE ALL ON FUNCTION public.tours_operator_offer_share(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tours_operator_offer_share(uuid, numeric) TO authenticated;

/**
 * Either side ends an active agreement. Tours the guide already has stay
 * with them (the confirmed-guide lock still applies); they can't get new ones.
 * The guide also comes off this operator's package guide lists.
 */
CREATE OR REPLACE FUNCTION public.tours_end_guide_agreement(p_id uuid, p_note text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  a tours_guide_applications%ROWTYPE;
  v_by_operator boolean;
  v_note text := NULLIF(btrim(COALESCE(p_note, '')), '');
BEGIN
  SELECT * INTO a FROM tours_guide_applications WHERE id = p_id FOR UPDATE;
  v_by_operator := FOUND AND a.operator_id = tours_my_approved_operator_id();
  IF NOT FOUND OR NOT (v_by_operator OR EXISTS (SELECT 1 FROM tours_guides g WHERE g.id = a.guide_id AND g.profile_id = auth.uid())) THEN
    RAISE EXCEPTION 'Agreement not found.' USING ERRCODE = '42501';
  END IF;
  IF a.status <> 'active' THEN
    RAISE EXCEPTION 'Only an active agreement can be ended.' USING ERRCODE = 'check_violation';
  END IF;
  IF char_length(v_note) > 500 THEN
    RAISE EXCEPTION 'Keep the note under 500 characters.' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE tours_guide_applications SET status = 'ended', offered_share_pct = NULL, decided_note = v_note, ended_at = now(), updated_at = now()
   WHERE id = p_id RETURNING * INTO a;
  UPDATE tours_package_guides pg SET is_active = false
    FROM tours_packages p WHERE p.id = pg.package_id AND p.operator_id = a.operator_id AND pg.guide_id = a.guide_id;
  IF v_by_operator THEN
    PERFORM tours_application_notify_guide(a, 'Agreement ended',
      (SELECT business_name FROM tours_operators WHERE id = a.operator_id) || ' ended your agreement. Tours you already have stay with you.' || COALESCE(' ' || v_note, ''));
  ELSE
    PERFORM tours_application_notify_operator(a, 'Guide ended the agreement',
      tours_guide_name(a.guide_id) || ' ended your agreement. Tours they already have stay with them.' || COALESCE(' ' || v_note, ''));
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.tours_end_guide_agreement(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tours_end_guide_agreement(uuid, text) TO authenticated;

-- Assignment rule and pay ----------------------------------------------------

/**
 * Guide fee and lock (from 20261206), now with:
 *  * a new guide must work with the tour's operator (active agreement);
 *  * the fee is the agreed % of the tour price (total without pickup), or the
 *    package's fixed fee while a carried-over pair has no % yet.
 */
CREATE OR REPLACE FUNCTION public.tours_bookings_guide_fee()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_operator uuid;
  v_pct numeric;
BEGIN
  IF NEW.assigned_guide_id IS NOT DISTINCT FROM OLD.assigned_guide_id THEN
    RETURN NEW;
  END IF;

  IF OLD.assigned_guide_id IS NOT NULL AND auth.uid() IS NOT NULL AND get_my_role() IS DISTINCT FROM 'admin'
     -- The guest asked to go without a guide.
     AND NOT (NEW.assigned_guide_id IS NULL AND NEW.guide_not_needed_at IS NOT NULL)
     -- A swap request for this booking was approved in this transaction.
     AND NOT EXISTS (
       SELECT 1 FROM tours_guide_swap_requests s
        WHERE s.booking_id = NEW.id AND s.status = 'approved'
          AND s.to_guide_id IS NOT DISTINCT FROM NEW.assigned_guide_id
          AND s.decided_at = now()
     ) THEN
    RAISE EXCEPTION 'This tour''s guide is already confirmed and can''t be changed. If the guide can''t make it, they can ask to swap, or message the Tourism Office.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.assigned_guide_id IS NULL THEN
    NEW.guide_fee := NULL;
    NEW.guide_assigned_by := NULL;
    IF NEW.guide_proposal_status = 'approved' THEN
      NEW.guide_proposal_status := NULL;
      NEW.proposed_guide_id := NULL;
    END IF;
  ELSE
    SELECT operator_id INTO v_operator FROM tours_packages WHERE id = NEW.package_id;
    SELECT revenue_share_pct INTO v_pct FROM tours_guide_applications
     WHERE guide_id = NEW.assigned_guide_id AND operator_id = v_operator AND status = 'active';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'That guide doesn''t work with this operator yet. Only guides with an accepted agreement can be assigned.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_pct IS NOT NULL THEN
      NEW.guide_fee := round(v_pct / 100 * GREATEST(NEW.total_amount - COALESCE(NEW.pickup_fee, 0), 0), 2);
    ELSE
      SELECT guide_fee INTO NEW.guide_fee FROM tours_packages WHERE id = NEW.package_id;
    END IF;
    NEW.proposed_guide_id := NEW.assigned_guide_id;
    NEW.guide_proposal_status := 'approved';
    NEW.guide_assigned_by := CASE
      WHEN auth.uid() IS NULL THEN 'system'
      WHEN get_my_role() = 'admin' THEN 'admin'
      ELSE 'operator' END;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tours_bookings_guide_fee() FROM PUBLIC, anon, authenticated;

/** The automatic pick (from 20261204), limited to the tour operator's guides. */
CREATE OR REPLACE FUNCTION public.tours_pick_guide(p_package_id uuid, p_date date, p_booking_id uuid, p_rejected uuid[])
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT g.id
    FROM tours_guides g
    JOIN tours_packages p ON p.id = p_package_id
   WHERE g.accreditation_status = 'approved'
     AND tours_guide_works_for(g.id, p.operator_id)
     AND (
       EXISTS (SELECT 1 FROM tours_package_guides pg WHERE pg.package_id = p.id AND pg.guide_id = g.id AND pg.is_active)
       OR EXISTS (SELECT 1 FROM tours_guide_service_areas sa WHERE sa.guide_id = g.id AND sa.municipality = p.municipality)
     )
     AND NOT (g.id = ANY (COALESCE(p_rejected, '{}')))
     AND tours_guide_busy_reason(g.id, p_date, p_booking_id) IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM tours_bookings o
        WHERE o.proposed_guide_id = g.id AND o.tour_date = p_date
          AND o.guide_proposal_status = 'proposed' AND o.status IN ('pending', 'confirmed')
          AND (p_booking_id IS NULL OR o.id <> p_booking_id)
     )
   ORDER BY
     NOT EXISTS (SELECT 1 FROM tours_package_guides pg WHERE pg.package_id = p.id AND pg.guide_id = g.id AND pg.is_active),
     (SELECT count(*) FROM tours_bookings w
       WHERE w.assigned_guide_id = g.id AND w.status IN ('confirmed', 'completed')
         AND w.tour_date >= p_date - 30 AND w.tour_date <= p_date),
     g.created_at, g.id
   LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.tours_pick_guide(uuid, date, uuid, uuid[]) FROM PUBLIC, anon, authenticated;

/** Admin proposal (from 20261203): a named guide must work with the tour's operator. */
CREATE OR REPLACE FUNCTION public.tours_admin_propose_guide(p_booking_id uuid, p_guide_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  b tours_bookings%ROWTYPE;
  v_guide uuid := p_guide_id;
  v_reason text;
BEGIN
  IF get_my_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only admins can propose guides.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO b FROM tours_bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND OR b.status NOT IN ('pending', 'confirmed') THEN
    RAISE EXCEPTION 'Only pending or confirmed bookings can get a guide.' USING ERRCODE = 'check_violation';
  END IF;
  IF b.assigned_guide_id IS NOT NULL THEN
    RAISE EXCEPTION 'This booking already has a guide.' USING ERRCODE = 'check_violation';
  END IF;
  IF v_guide IS NULL THEN
    v_guide := tours_pick_guide(b.package_id, b.tour_date, b.id, b.rejected_guide_ids);
  ELSE
    IF NOT tours_guide_works_for(v_guide, (SELECT operator_id FROM tours_packages WHERE id = b.package_id)) THEN
      RAISE EXCEPTION 'That guide doesn''t work with this tour''s operator.' USING ERRCODE = 'check_violation';
    END IF;
    v_reason := tours_guide_busy_reason(v_guide, b.tour_date, b.id);
    IF v_reason IS NOT NULL THEN
      RAISE EXCEPTION '%', CASE v_reason
        WHEN 'not_approved' THEN 'That guide is not approved.'
        WHEN 'not_available' THEN 'That guide has not marked the day as available.'
        ELSE 'That guide already has a tour that day.' END
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  UPDATE tours_bookings
     SET proposed_guide_id = v_guide,
         guide_proposal_status = CASE WHEN v_guide IS NULL THEN 'none_available' ELSE 'proposed' END,
         guide_proposed_by = CASE WHEN p_guide_id IS NULL THEN 'auto' ELSE 'admin' END,
         guide_proposed_at = now(),
         guide_not_needed_at = NULL,
         guide_not_needed_note = NULL
   WHERE id = p_booking_id;
  INSERT INTO tours_admin_audit_log (admin_id, action, entity_type, entity_id, old_value, new_value)
  VALUES (auth.uid(), 'propose_guide', 'booking', p_booking_id, to_jsonb(b.proposed_guide_id)::text, to_jsonb(v_guide)::text);
  RETURN CASE WHEN v_guide IS NULL THEN 'none_available' ELSE 'proposed' END;
END;
$$;
REVOKE ALL ON FUNCTION public.tours_admin_propose_guide(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tours_admin_propose_guide(uuid, uuid) TO authenticated;

/** A package's guides (from 20261204): only guides who work with its operator. */
CREATE OR REPLACE FUNCTION public.tours_admin_set_package_guides(p_package_id uuid, p_guide_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_old uuid[];
  v_new uuid[];
  v_operator uuid;
BEGIN
  IF get_my_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only admins can choose a package''s guides.' USING ERRCODE = '42501';
  END IF;
  SELECT operator_id INTO v_operator FROM tours_packages WHERE id = p_package_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Package not found.' USING ERRCODE = '22023';
  END IF;
  SELECT COALESCE(array_agg(DISTINCT g), '{}') INTO v_new FROM unnest(COALESCE(p_guide_ids, '{}')) g;
  IF array_length(v_new, 1) > 20 THEN
    RAISE EXCEPTION 'Choose up to 20 guides for a package.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_new) g WHERE NOT EXISTS (SELECT 1 FROM tours_guides t WHERE t.id = g AND t.accreditation_status = 'approved')) THEN
    RAISE EXCEPTION 'Only approved guides can be chosen.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_new) g WHERE NOT tours_guide_works_for(g, v_operator)) THEN
    RAISE EXCEPTION 'Only guides who work with this package''s operator can be chosen.' USING ERRCODE = '22023';
  END IF;
  SELECT COALESCE(array_agg(guide_id ORDER BY guide_id), '{}') INTO v_old FROM tours_package_guides WHERE package_id = p_package_id AND is_active;
  UPDATE tours_package_guides SET is_active = (guide_id = ANY (v_new)) WHERE package_id = p_package_id;
  INSERT INTO tours_package_guides (package_id, guide_id, is_active)
  SELECT p_package_id, g, true FROM unnest(v_new) g
  ON CONFLICT (package_id, guide_id) DO UPDATE SET is_active = true;
  INSERT INTO tours_admin_audit_log (admin_id, action, entity_type, entity_id, old_value, new_value)
  VALUES (auth.uid(), 'set_package_guides', 'package', p_package_id, to_jsonb(v_old)::text, to_jsonb(v_new)::text);
END;
$$;
REVOKE ALL ON FUNCTION public.tours_admin_set_package_guides(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tours_admin_set_package_guides(uuid, uuid[]) TO authenticated;

/** Admin board (from 20261204), now with each package's and booking's operator team, so the admin only picks guides who work with that operator. */
CREATE OR REPLACE FUNCTION public.tours_admin_guide_coverage()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF get_my_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only admins can view guide coverage.' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'areas', (
      SELECT jsonb_agg(jsonb_build_object(
        'municipality', m,
        'guides', (SELECT count(*) FROM tours_guide_service_areas sa JOIN tours_guides g ON g.id = sa.guide_id
                    WHERE sa.municipality = m AND g.accreditation_status = 'approved')::int,
        'packages', (SELECT count(*) FROM tours_packages p WHERE p.municipality = m AND p.status = 'published')::int
      ) ORDER BY m)
      FROM unnest(tours_municipalities()) m
    ),
    'unplaced_packages', (SELECT count(*) FROM tours_packages WHERE status = 'published' AND municipality IS NULL)::int,
    'guides', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', g.id, 'name', COALESCE(pr.full_name, 'Guide'),
        'areas', COALESCE((SELECT jsonb_agg(sa.municipality ORDER BY sa.municipality) FROM tours_guide_service_areas sa WHERE sa.guide_id = g.id), '[]'::jsonb)
      ) ORDER BY pr.full_name), '[]'::jsonb)
      FROM tours_guides g LEFT JOIN profiles pr ON pr.id = g.profile_id
      WHERE g.accreditation_status = 'approved'
    ),
    'packages', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', p.id, 'title', p.title, 'operator', op.business_name, 'municipality', p.municipality,
        'guide_ids', COALESCE((SELECT jsonb_agg(pg.guide_id) FROM tours_package_guides pg
                                JOIN tours_guides g ON g.id = pg.guide_id
                               WHERE pg.package_id = p.id AND pg.is_active AND g.accreditation_status = 'approved'), '[]'::jsonb),
        'team_ids', COALESCE((SELECT jsonb_agg(a.guide_id) FROM tours_guide_applications a WHERE a.operator_id = p.operator_id AND a.status = 'active'), '[]'::jsonb)
      ) ORDER BY p.title, op.business_name), '[]'::jsonb)
      FROM tours_packages p JOIN tours_operators op ON op.id = p.operator_id
      WHERE p.status = 'published'
    ),
    'bookings', (
      SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.tour_date), '[]'::jsonb) FROM (
        SELECT b.id, b.booking_reference, b.tour_date, b.status, b.number_of_pax,
               p.title, p.municipality, b.guide_proposal_status, b.guide_proposed_by,
               b.proposed_guide_id, gp.full_name AS proposed_guide_name, op.business_name AS operator_name,
               COALESCE((SELECT jsonb_agg(a.guide_id) FROM tours_guide_applications a WHERE a.operator_id = p.operator_id AND a.status = 'active'), '[]'::jsonb) AS team_ids
          FROM tours_bookings b
          JOIN tours_packages p ON p.id = b.package_id
          JOIN tours_operators op ON op.id = p.operator_id
          LEFT JOIN tours_guides g ON g.id = b.proposed_guide_id
          LEFT JOIN profiles gp ON gp.id = g.profile_id
         WHERE b.status IN ('pending', 'confirmed') AND b.assigned_guide_id IS NULL
           AND b.guide_not_needed_at IS NULL
           AND b.tour_date >= (now() AT TIME ZONE 'Asia/Manila')::date
         LIMIT 200
      ) x
    )
  );
END;
$$;
REVOKE ALL ON FUNCTION public.tours_admin_guide_coverage() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tours_admin_guide_coverage() TO authenticated;

/**
 * The pickers' guide list (from 20261108), limited to guides who can take the
 * tour: with a booking, that booking's operator team (a guide suggesting a
 * swap); for an operator, their team; admins see every approved guide.
 */
CREATE OR REPLACE FUNCTION public.tours_guides_free_on(p_date date, p_exclude_booking uuid DEFAULT NULL)
RETURNS TABLE (guide_id uuid, full_name text, reason text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := COALESCE(get_my_role(), '');
  v_operator uuid;
BEGIN
  IF v_role NOT IN ('operator', 'guide', 'admin') THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  -- A booking's team is shown only to its operator, its guide and admins.
  IF p_exclude_booking IS NOT NULL THEN
    SELECT p.operator_id INTO v_operator
      FROM tours_bookings b JOIN tours_packages p ON p.id = b.package_id
     WHERE b.id = p_exclude_booking
       AND (v_role = 'admin' OR tours_is_my_operator(p.operator_id)
            OR EXISTS (SELECT 1 FROM tours_guides g WHERE g.id = b.assigned_guide_id AND g.profile_id = auth.uid()));
  END IF;
  IF v_operator IS NULL AND v_role = 'operator' THEN
    v_operator := tours_my_approved_operator_id();
  END IF;
  RETURN QUERY
    SELECT g.id, COALESCE(pr.full_name, 'Guide')::text, tours_guide_busy_reason(g.id, p_date, p_exclude_booking)
    FROM tours_guides g
    LEFT JOIN profiles pr ON pr.id = g.profile_id
    WHERE g.accreditation_status = 'approved'
      AND (
        (v_operator IS NOT NULL AND tours_guide_works_for(g.id, v_operator))
        OR (v_operator IS NULL AND v_role = 'admin')
      )
    ORDER BY 3 NULLS FIRST, 2;
END;
$$;
REVOKE ALL ON FUNCTION public.tours_guides_free_on(date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tours_guides_free_on(date, uuid) TO authenticated;

-- Carry-over -----------------------------------------------------------------
-- Guides already on an operator's packages or upcoming tours keep working with
-- that operator, with no % yet (they keep the package's fixed fee until the
-- operator offers a % and they accept it).
INSERT INTO public.tours_guide_applications (guide_id, operator_id, status, message, accepted_at)
SELECT DISTINCT pair.guide_id, pair.operator_id, 'active', 'Carried over: already guiding this operator''s tours before applications started.', now()
  FROM (
    SELECT pg.guide_id, p.operator_id FROM tours_package_guides pg JOIN tours_packages p ON p.id = pg.package_id WHERE pg.is_active
    UNION
    SELECT b.assigned_guide_id, p.operator_id FROM tours_bookings b JOIN tours_packages p ON p.id = b.package_id
     WHERE b.assigned_guide_id IS NOT NULL AND b.status IN ('pending', 'confirmed')
  ) pair
  JOIN tours_guides g ON g.id = pair.guide_id AND g.accreditation_status = 'approved'
ON CONFLICT (guide_id, operator_id) DO NOTHING;
