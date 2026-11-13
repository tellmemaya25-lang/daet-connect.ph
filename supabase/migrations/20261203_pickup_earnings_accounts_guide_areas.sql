-- Owner's list, items 5 to 9.
--
--  5. Pickup points: each package can list pickup points with a fee set by its
--     operator (per booking or per person). The tourist picks one when booking
--     and the fee is added to the total on the server. No pickup = meet at the
--     package's meeting point, no fee.
--  6. Earnings: a package has a guide fee (per tour) set by its operator. The
--     fee is copied onto a booking when a guide is assigned, so later edits do
--     not change past pay. tours_earnings() returns the caller's figures by
--     role (guide, operator, admin).
--  7. Accounts: admins list accounts, change roles and suspend accounts.
--     Suspension also bans sign-in; the app does that with the service role.
--  8. Admin proposes a guide for a booking; the booking's operator approves or
--     rejects the proposal. Approving assigns the guide.
--  9. Guides have service areas (municipalities of Camarines Norte). A new
--     booking is proposed the least-busy free guide whose area includes the
--     package's municipality. A rejection proposes the next one.
--
-- New booking columns are not in the column UPDATE grant for `authenticated`,
-- so only these SECURITY DEFINER functions change them.

-- ---------------------------------------------------------------- shared

-- The audit log only accepts listed actions; add the ones this file writes.
ALTER TABLE public.tours_admin_audit_log DROP CONSTRAINT IF EXISTS valid_action;
ALTER TABLE public.tours_admin_audit_log ADD CONSTRAINT valid_action CHECK (action = ANY (ARRAY[
  'approve_operator', 'reject_operator', 'approve_guide', 'reject_guide', 'update_package_status',
  'delete_package', 'ban_user', 'unban_user', 'change_user_role', 'set_guide_areas', 'propose_guide'
]));

CREATE OR REPLACE FUNCTION public.tours_municipalities()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ARRAY['Basud', 'Capalonga', 'Daet', 'Jose Panganiban', 'Labo', 'Mercedes',
               'Paracale', 'San Lorenzo Ruiz', 'San Vicente', 'Santa Elena', 'Talisay', 'Vinzons'];
$$;

CREATE OR REPLACE FUNCTION public.tours_can_manage_package(p_package_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT get_my_role() = 'admin' OR EXISTS (
    SELECT 1 FROM tours_packages p JOIN tours_operators o ON o.id = p.operator_id
     WHERE p.id = p_package_id AND o.profile_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------- 5. pickup points

CREATE TABLE IF NOT EXISTS public.tours_package_pickup_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES public.tours_packages(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 120),
  fee numeric(10,2) NOT NULL DEFAULT 0 CHECK (fee >= 0 AND fee <= 100000),
  fee_per text NOT NULL DEFAULT 'booking' CHECK (fee_per IN ('booking', 'person')),
  note text CHECK (note IS NULL OR char_length(note) <= 300),
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tours_package_pickup_points_package_idx ON public.tours_package_pickup_points (package_id, sort_order);

ALTER TABLE public.tours_package_pickup_points ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tours_pickup_points_select ON public.tours_package_pickup_points;
CREATE POLICY tours_pickup_points_select ON public.tours_package_pickup_points
  FOR SELECT USING (
    (is_active AND EXISTS (SELECT 1 FROM tours_packages p WHERE p.id = package_id AND p.status = 'published'))
    OR tours_can_manage_package(package_id)
  );
REVOKE ALL ON public.tours_package_pickup_points FROM anon, authenticated;
GRANT SELECT ON public.tours_package_pickup_points TO anon, authenticated;

ALTER TABLE public.tours_bookings
  ADD COLUMN IF NOT EXISTS pickup_point_id uuid REFERENCES public.tours_package_pickup_points(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pickup_name text,
  ADD COLUMN IF NOT EXISTS pickup_fee numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS guide_fee numeric(10,2),
  ADD COLUMN IF NOT EXISTS proposed_guide_id uuid REFERENCES public.tours_guides(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS guide_proposal_status text CHECK (guide_proposal_status IN ('proposed', 'approved', 'none_available')),
  ADD COLUMN IF NOT EXISTS guide_proposed_by text CHECK (guide_proposed_by IN ('auto', 'admin')),
  ADD COLUMN IF NOT EXISTS guide_proposed_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_guide_ids uuid[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS tours_bookings_proposed_guide_idx ON public.tours_bookings (proposed_guide_id, tour_date) WHERE proposed_guide_id IS NOT NULL;

/** Operator (or admin) replaces a package's pickup list. Bookings keep their copy of name and fee. */
CREATE OR REPLACE FUNCTION public.tours_set_pickup_points(p_package_id uuid, p_points jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_point jsonb;
  v_index integer := 0;
BEGIN
  IF NOT tours_can_manage_package(p_package_id) THEN
    RAISE EXCEPTION 'You can only change pickup points on your own packages.' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(COALESCE(p_points, '[]'::jsonb)) <> 'array' OR jsonb_array_length(COALESCE(p_points, '[]'::jsonb)) > 20 THEN
    RAISE EXCEPTION 'List up to 20 pickup points.' USING ERRCODE = '22023';
  END IF;
  DELETE FROM tours_package_pickup_points WHERE package_id = p_package_id;
  FOR v_point IN SELECT * FROM jsonb_array_elements(COALESCE(p_points, '[]'::jsonb)) LOOP
    IF char_length(btrim(COALESCE(v_point->>'name', ''))) < 2 THEN
      RAISE EXCEPTION 'Each pickup point needs a name.' USING ERRCODE = '22023';
    END IF;
    IF (v_point->>'fee') IS NULL OR (v_point->>'fee')::numeric < 0 OR (v_point->>'fee')::numeric > 100000 THEN
      RAISE EXCEPTION 'Pickup fees must be between 0 and 100,000 pesos.' USING ERRCODE = '22023';
    END IF;
    INSERT INTO tours_package_pickup_points (package_id, name, fee, fee_per, note, sort_order)
    VALUES (
      p_package_id,
      btrim(v_point->>'name'),
      round((v_point->>'fee')::numeric, 2),
      CASE WHEN v_point->>'fee_per' = 'person' THEN 'person' ELSE 'booking' END,
      NULLIF(btrim(COALESCE(v_point->>'note', '')), ''),
      v_index
    );
    v_index := v_index + 1;
  END LOOP;
EXCEPTION WHEN invalid_text_representation THEN
  RAISE EXCEPTION 'Pickup fees must be numbers.' USING ERRCODE = '22023';
END;
$$;
REVOKE ALL ON FUNCTION public.tours_set_pickup_points(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tours_set_pickup_points(uuid, jsonb) TO authenticated;

-- ---------------------------------------------------------------- 6 and 9. package guide fee and area

ALTER TABLE public.tours_packages
  ADD COLUMN IF NOT EXISTS guide_fee numeric(10,2) CHECK (guide_fee IS NULL OR (guide_fee >= 0 AND guide_fee <= 100000)),
  ADD COLUMN IF NOT EXISTS municipality text CHECK (municipality IS NULL OR municipality = ANY (public.tours_municipalities()));

CREATE OR REPLACE FUNCTION public.tours_set_package_guide_settings(p_package_id uuid, p_guide_fee numeric, p_municipality text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT tours_can_manage_package(p_package_id) THEN
    RAISE EXCEPTION 'You can only change your own packages.' USING ERRCODE = '42501';
  END IF;
  IF p_guide_fee IS NOT NULL AND (p_guide_fee < 0 OR p_guide_fee > 100000) THEN
    RAISE EXCEPTION 'The guide fee must be between 0 and 100,000 pesos.' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(btrim(COALESCE(p_municipality, '')), '') IS NOT NULL AND NOT (btrim(p_municipality) = ANY (tours_municipalities())) THEN
    RAISE EXCEPTION 'Choose a municipality from the list.' USING ERRCODE = '22023';
  END IF;
  UPDATE tours_packages
     SET guide_fee = round(p_guide_fee, 2),
         municipality = NULLIF(btrim(COALESCE(p_municipality, '')), '')
   WHERE id = p_package_id;
END;
$$;
REVOKE ALL ON FUNCTION public.tours_set_package_guide_settings(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tours_set_package_guide_settings(uuid, numeric, text) TO authenticated;

-- ---------------------------------------------------------------- 9. service areas

CREATE TABLE IF NOT EXISTS public.tours_guide_service_areas (
  guide_id uuid NOT NULL REFERENCES public.tours_guides(id) ON DELETE CASCADE,
  municipality text NOT NULL CHECK (municipality = ANY (public.tours_municipalities())),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guide_id, municipality)
);
CREATE INDEX IF NOT EXISTS tours_guide_service_areas_muni_idx ON public.tours_guide_service_areas (municipality);
ALTER TABLE public.tours_guide_service_areas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tours_guide_service_areas_select ON public.tours_guide_service_areas;
CREATE POLICY tours_guide_service_areas_select ON public.tours_guide_service_areas
  FOR SELECT TO authenticated USING (true);
REVOKE ALL ON public.tours_guide_service_areas FROM anon, authenticated;
GRANT SELECT ON public.tours_guide_service_areas TO authenticated;

CREATE OR REPLACE FUNCTION public.tours_admin_set_guide_areas(p_guide_id uuid, p_areas text[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_old text[];
  v_new text[];
BEGIN
  IF get_my_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only admins can set guide service areas.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM tours_guides WHERE id = p_guide_id) THEN
    RAISE EXCEPTION 'Guide not found.' USING ERRCODE = '22023';
  END IF;
  SELECT COALESCE(array_agg(DISTINCT btrim(a)), '{}') INTO v_new FROM unnest(COALESCE(p_areas, '{}')) a WHERE btrim(a) <> '';
  IF EXISTS (SELECT 1 FROM unnest(v_new) a WHERE NOT (a = ANY (tours_municipalities()))) THEN
    RAISE EXCEPTION 'Choose municipalities from the list.' USING ERRCODE = '22023';
  END IF;
  SELECT COALESCE(array_agg(municipality ORDER BY municipality), '{}') INTO v_old FROM tours_guide_service_areas WHERE guide_id = p_guide_id;
  DELETE FROM tours_guide_service_areas WHERE guide_id = p_guide_id;
  INSERT INTO tours_guide_service_areas (guide_id, municipality) SELECT p_guide_id, a FROM unnest(v_new) a;
  INSERT INTO tours_admin_audit_log (admin_id, action, entity_type, entity_id, old_value, new_value)
  VALUES (auth.uid(), 'set_guide_areas', 'guide', p_guide_id, to_jsonb(v_old)::text, to_jsonb(v_new)::text);
END;
$$;
REVOKE ALL ON FUNCTION public.tours_admin_set_guide_areas(uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tours_admin_set_guide_areas(uuid, text[]) TO authenticated;

/**
 * The guide to propose for a booking: approved, free that day (marked
 * available, not on another tour), serving the package's municipality, not
 * already rejected for this booking and not proposed for another tour that
 * day. Least busy over the last 30 days first, so work is shared.
 */
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
    JOIN tours_guide_service_areas sa ON sa.guide_id = g.id AND sa.municipality = p.municipality
   WHERE g.accreditation_status = 'approved'
     AND NOT (g.id = ANY (COALESCE(p_rejected, '{}')))
     AND tours_guide_busy_reason(g.id, p_date, p_booking_id) IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM tours_bookings o
        WHERE o.proposed_guide_id = g.id AND o.tour_date = p_date
          AND o.guide_proposal_status = 'proposed' AND o.status IN ('pending', 'confirmed')
          AND (p_booking_id IS NULL OR o.id <> p_booking_id)
     )
   ORDER BY (
     SELECT count(*) FROM tours_bookings w
      WHERE w.assigned_guide_id = g.id AND w.status IN ('confirmed', 'completed')
        AND w.tour_date >= p_date - 30 AND w.tour_date <= p_date
   ), g.created_at, g.id
   LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.tours_pick_guide(uuid, date, uuid, uuid[]) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------- booking triggers

/**
 * After pricing (trg_tours_bookings_before_insert sorts before this name):
 * adds the pickup fee, clears fields only the system sets, and proposes a
 * guide from the package's area.
 */
CREATE OR REPLACE FUNCTION public.tours_bookings_pickup_and_guide()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_point tours_package_pickup_points%ROWTYPE;
  v_muni text;
  v_guide uuid;
BEGIN
  NEW.pickup_name := NULL;
  NEW.pickup_fee := 0;
  IF NEW.pickup_point_id IS NOT NULL THEN
    SELECT * INTO v_point FROM tours_package_pickup_points
     WHERE id = NEW.pickup_point_id AND package_id = NEW.package_id AND is_active;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Choose a pickup point from the list.' USING ERRCODE = 'check_violation';
    END IF;
    NEW.pickup_name := v_point.name;
    NEW.pickup_fee := CASE WHEN v_point.fee_per = 'person' THEN v_point.fee * NEW.number_of_pax ELSE v_point.fee END;
    NEW.total_amount := NEW.total_amount + NEW.pickup_fee;
  END IF;

  NEW.guide_fee := NULL;
  NEW.proposed_guide_id := NULL;
  NEW.guide_proposal_status := NULL;
  NEW.guide_proposed_by := NULL;
  NEW.guide_proposed_at := NULL;
  NEW.rejected_guide_ids := '{}';

  IF NEW.guide_not_needed_at IS NULL THEN
    SELECT municipality INTO v_muni FROM tours_packages WHERE id = NEW.package_id;
    IF v_muni IS NOT NULL THEN
      v_guide := tours_pick_guide(NEW.package_id, NEW.tour_date, NEW.id, '{}');
      NEW.proposed_guide_id := v_guide;
      NEW.guide_proposal_status := CASE WHEN v_guide IS NULL THEN 'none_available' ELSE 'proposed' END;
      NEW.guide_proposed_by := 'auto';
      NEW.guide_proposed_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tours_bookings_pickup_and_guide() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_tours_bookings_c_pickup_and_guide ON public.tours_bookings;
CREATE TRIGGER trg_tours_bookings_c_pickup_and_guide
  BEFORE INSERT ON public.tours_bookings
  FOR EACH ROW EXECUTE FUNCTION public.tours_bookings_pickup_and_guide();

/**
 * A guide's pay is the package's guide fee at the moment they are assigned.
 * Any assignment (proposal approved or picked by hand) settles the proposal.
 */
CREATE OR REPLACE FUNCTION public.tours_bookings_guide_fee()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.assigned_guide_id IS NOT DISTINCT FROM OLD.assigned_guide_id THEN
    RETURN NEW;
  END IF;
  IF NEW.assigned_guide_id IS NULL THEN
    NEW.guide_fee := NULL;
    IF NEW.guide_proposal_status = 'approved' THEN
      NEW.guide_proposal_status := NULL;
      NEW.proposed_guide_id := NULL;
    END IF;
  ELSE
    SELECT guide_fee INTO NEW.guide_fee FROM tours_packages WHERE id = NEW.package_id;
    NEW.proposed_guide_id := NEW.assigned_guide_id;
    NEW.guide_proposal_status := 'approved';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tours_bookings_guide_fee() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_tours_bookings_guide_fee ON public.tours_bookings;
CREATE TRIGGER trg_tours_bookings_guide_fee
  BEFORE UPDATE OF assigned_guide_id ON public.tours_bookings
  FOR EACH ROW EXECUTE FUNCTION public.tours_bookings_guide_fee();

-- ---------------------------------------------------------------- 8. proposals

CREATE OR REPLACE FUNCTION public.tours_review_guide_proposal(p_booking_id uuid, p_approve boolean)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  b tours_bookings%ROWTYPE;
  v_next uuid;
  v_rejected uuid[];
BEGIN
  IF NOT (tours_is_booking_operator(p_booking_id) OR get_my_role() = 'admin') THEN
    RAISE EXCEPTION 'Only the operator of this booking can approve its guide.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO b FROM tours_bookings WHERE id = p_booking_id FOR UPDATE;
  IF b.guide_proposal_status IS DISTINCT FROM 'proposed' OR b.proposed_guide_id IS NULL THEN
    RAISE EXCEPTION 'There is no guide waiting for your approval on this booking.' USING ERRCODE = 'check_violation';
  END IF;
  IF b.status NOT IN ('pending', 'confirmed') THEN
    RAISE EXCEPTION 'This booking is already %.', b.status USING ERRCODE = 'check_violation';
  END IF;

  IF p_approve THEN
    -- The schedule guard re-checks the guide is still free.
    UPDATE tours_bookings SET assigned_guide_id = b.proposed_guide_id WHERE id = p_booking_id;
    RETURN 'approved';
  END IF;

  v_rejected := b.rejected_guide_ids || b.proposed_guide_id;
  v_next := tours_pick_guide(b.package_id, b.tour_date, b.id, v_rejected);
  UPDATE tours_bookings
     SET rejected_guide_ids = v_rejected,
         proposed_guide_id = v_next,
         guide_proposal_status = CASE WHEN v_next IS NULL THEN 'none_available' ELSE 'proposed' END,
         guide_proposed_by = 'auto',
         guide_proposed_at = now()
   WHERE id = p_booking_id;
  RETURN CASE WHEN v_next IS NULL THEN 'none_available' ELSE 'proposed' END;
END;
$$;
REVOKE ALL ON FUNCTION public.tours_review_guide_proposal(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tours_review_guide_proposal(uuid, boolean) TO authenticated;

/** Admin proposes a guide (or, with NULL, asks the system to pick again); the operator still approves. */
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

/** Admin board: guides per municipality, and upcoming bookings still without a guide. */
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
    'bookings', (
      SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.tour_date), '[]'::jsonb) FROM (
        SELECT b.id, b.booking_reference, b.tour_date, b.status, b.number_of_pax,
               p.title, p.municipality, b.guide_proposal_status, b.guide_proposed_by,
               b.proposed_guide_id, gp.full_name AS proposed_guide_name, op.business_name AS operator_name
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

-- ---------------------------------------------------------------- 6. earnings

/**
 * The caller's money for tours dated p_from..p_to (Manila dates), by role.
 *   guide:    earned = guide fees on completed tours; expected = on confirmed ones.
 *   operator: booked = total of confirmed + completed bookings; collected and
 *             refunded = payments in the range; guide fees = owed to guides on
 *             completed tours; net = collected - refunded - guide fees.
 *   admin:    the same for every operator and guide, plus totals.
 */
CREATE OR REPLACE FUNCTION public.tours_earnings(p_from date, p_to date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_role text := get_my_role();
  v_start timestamptz;
  v_end timestamptz;
  v_guide uuid;
  v_operator uuid;
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to - p_from > 366 THEN
    RAISE EXCEPTION 'Choose a date range of up to one year.' USING ERRCODE = '22023';
  END IF;
  v_start := p_from::timestamp AT TIME ZONE 'Asia/Manila';
  v_end := (p_to + 1)::timestamp AT TIME ZONE 'Asia/Manila';

  IF v_role = 'guide' THEN
    SELECT id INTO v_guide FROM tours_guides WHERE profile_id = auth.uid();
    RETURN jsonb_build_object(
      'role', 'guide', 'from', p_from, 'to', p_to,
      'completed_tours', (SELECT count(*) FROM tours_bookings WHERE assigned_guide_id = v_guide AND status = 'completed' AND tour_date BETWEEN p_from AND p_to)::int,
      'earned', (SELECT COALESCE(sum(guide_fee), 0) FROM tours_bookings WHERE assigned_guide_id = v_guide AND status = 'completed' AND tour_date BETWEEN p_from AND p_to),
      'upcoming_tours', (SELECT count(*) FROM tours_bookings WHERE assigned_guide_id = v_guide AND status = 'confirmed' AND tour_date BETWEEN p_from AND p_to)::int,
      'expected', (SELECT COALESCE(sum(guide_fee), 0) FROM tours_bookings WHERE assigned_guide_id = v_guide AND status = 'confirmed' AND tour_date BETWEEN p_from AND p_to),
      'unpriced_tours', (SELECT count(*) FROM tours_bookings WHERE assigned_guide_id = v_guide AND status IN ('confirmed', 'completed') AND guide_fee IS NULL AND tour_date BETWEEN p_from AND p_to)::int,
      'tours', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object('id', b.id, 'reference', b.booking_reference, 'date', b.tour_date, 'title', p.title, 'pax', b.number_of_pax, 'status', b.status, 'fee', b.guide_fee) ORDER BY b.tour_date DESC), '[]'::jsonb)
          FROM tours_bookings b JOIN tours_packages p ON p.id = b.package_id
         WHERE b.assigned_guide_id = v_guide AND b.status IN ('confirmed', 'completed') AND b.tour_date BETWEEN p_from AND p_to
      )
    );
  END IF;

  IF v_role = 'operator' THEN
    SELECT id INTO v_operator FROM tours_operators WHERE profile_id = auth.uid();
  ELSIF v_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Earnings are for guides, operators and admins.' USING ERRCODE = '42501';
  END IF;

  RETURN (
    WITH ops AS (
      SELECT o.id, o.business_name FROM tours_operators o
       WHERE (v_operator IS NOT NULL AND o.id = v_operator)
          OR (v_role = 'admin' AND o.accreditation_status = 'approved')
    ), per_op AS (
      SELECT ops.id, ops.business_name,
        (SELECT count(*) FROM tours_bookings b JOIN tours_packages p ON p.id = b.package_id
          WHERE p.operator_id = ops.id AND b.status IN ('confirmed', 'completed') AND b.tour_date BETWEEN p_from AND p_to)::int AS bookings,
        (SELECT COALESCE(sum(b.total_amount), 0) FROM tours_bookings b JOIN tours_packages p ON p.id = b.package_id
          WHERE p.operator_id = ops.id AND b.status IN ('confirmed', 'completed') AND b.tour_date BETWEEN p_from AND p_to) AS booked,
        (SELECT COALESCE(sum(b.pickup_fee), 0) FROM tours_bookings b JOIN tours_packages p ON p.id = b.package_id
          WHERE p.operator_id = ops.id AND b.status IN ('confirmed', 'completed') AND b.tour_date BETWEEN p_from AND p_to) AS pickup_fees,
        (SELECT COALESCE(sum(pay.amount), 0) FROM tours_payments pay JOIN tours_bookings b ON b.id = pay.booking_id JOIN tours_packages p ON p.id = b.package_id
          WHERE p.operator_id = ops.id AND pay.payment_status = 'completed' AND pay.payment_date >= v_start AND pay.payment_date < v_end) AS collected,
        (SELECT COALESCE(sum(pay.amount), 0) FROM tours_payments pay JOIN tours_bookings b ON b.id = pay.booking_id JOIN tours_packages p ON p.id = b.package_id
          WHERE p.operator_id = ops.id AND pay.payment_status = 'refunded' AND pay.payment_date >= v_start AND pay.payment_date < v_end) AS refunded,
        (SELECT COALESCE(sum(b.guide_fee), 0) FROM tours_bookings b JOIN tours_packages p ON p.id = b.package_id
          WHERE p.operator_id = ops.id AND b.status = 'completed' AND b.tour_date BETWEEN p_from AND p_to) AS guide_fees
      FROM ops
    ), per_guide AS (
      SELECT g.id, COALESCE(pr.full_name, 'Guide') AS name,
             count(*) FILTER (WHERE b.status = 'completed')::int AS completed_tours,
             COALESCE(sum(b.guide_fee) FILTER (WHERE b.status = 'completed'), 0) AS earned,
             COALESCE(sum(b.guide_fee) FILTER (WHERE b.status = 'confirmed'), 0) AS expected
        FROM tours_bookings b
        JOIN tours_packages p ON p.id = b.package_id
        JOIN tours_guides g ON g.id = b.assigned_guide_id
        LEFT JOIN profiles pr ON pr.id = g.profile_id
       WHERE b.status IN ('confirmed', 'completed') AND b.tour_date BETWEEN p_from AND p_to
         AND (v_role = 'admin' OR p.operator_id = v_operator)
       GROUP BY g.id, pr.full_name
    )
    SELECT jsonb_build_object(
      'role', v_role, 'from', p_from, 'to', p_to,
      'totals', jsonb_build_object(
        'bookings', COALESCE((SELECT sum(bookings) FROM per_op), 0),
        'booked', COALESCE((SELECT sum(booked) FROM per_op), 0),
        'pickup_fees', COALESCE((SELECT sum(pickup_fees) FROM per_op), 0),
        'collected', COALESCE((SELECT sum(collected) FROM per_op), 0),
        'refunded', COALESCE((SELECT sum(refunded) FROM per_op), 0),
        'guide_fees', COALESCE((SELECT sum(guide_fees) FROM per_op), 0),
        'net', COALESCE((SELECT sum(collected - refunded - guide_fees) FROM per_op), 0)
      ),
      'operators', COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'id', id, 'name', business_name, 'bookings', bookings, 'booked', booked, 'pickup_fees', pickup_fees,
          'collected', collected, 'refunded', refunded, 'guide_fees', guide_fees, 'net', collected - refunded - guide_fees
        ) ORDER BY collected DESC, booked DESC) FROM per_op), '[]'::jsonb),
      'guides', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'name', name, 'completed_tours', completed_tours, 'earned', earned, 'expected', expected) ORDER BY earned DESC, name) FROM per_guide), '[]'::jsonb)
    )
  );
END;
$$;
REVOKE ALL ON FUNCTION public.tours_earnings(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tours_earnings(date, date) TO authenticated;

-- ---------------------------------------------------------------- 7. accounts

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_suspended boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspended_reason text;

CREATE OR REPLACE FUNCTION public.tours_admin_list_accounts(p_query text, p_role text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
DECLARE
  v_q text := NULLIF(btrim(COALESCE(p_query, '')), '');
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
BEGIN
  IF get_my_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only admins can manage accounts.' USING ERRCODE = '42501';
  END IF;
  RETURN (
    WITH matched AS (
      SELECT pr.id, pr.full_name, pr.role, pr.created_at, pr.is_suspended, pr.suspended_at, pr.suspended_reason,
             u.email::text AS email, u.last_sign_in_at,
             EXISTS (SELECT 1 FROM tours_operators o WHERE o.profile_id = pr.id) AS has_operator,
             EXISTS (SELECT 1 FROM tours_guides g WHERE g.profile_id = pr.id) AS has_guide
        FROM profiles pr
        LEFT JOIN auth.users u ON u.id = pr.id
       WHERE (p_role IS NULL OR p_role = '' OR pr.role = p_role OR (p_role = 'suspended' AND pr.is_suspended))
         AND (v_q IS NULL OR pr.full_name ILIKE '%' || v_q || '%' OR u.email ILIKE '%' || v_q || '%')
    )
    SELECT jsonb_build_object(
      'total', (SELECT count(*) FROM matched)::int,
      'counts', (SELECT jsonb_object_agg(role, n) FROM (SELECT role, count(*)::int n FROM profiles GROUP BY role) c),
      'accounts', COALESCE((SELECT jsonb_agg(row_to_json(m) ORDER BY m.created_at DESC) FROM (
        SELECT * FROM matched ORDER BY created_at DESC LIMIT v_limit OFFSET GREATEST(COALESCE(p_offset, 0), 0)
      ) m), '[]'::jsonb)
    )
  );
END;
$$;
REVOKE ALL ON FUNCTION public.tours_admin_list_accounts(text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tours_admin_list_accounts(text, text, integer, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.tours_admin_set_role(p_user_id uuid, p_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_old text;
BEGIN
  IF get_my_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only admins can change roles.' USING ERRCODE = '42501';
  END IF;
  IF p_role NOT IN ('tourist', 'operator', 'guide', 'admin') THEN
    RAISE EXCEPTION 'Choose tourist, operator, guide or admin.' USING ERRCODE = '22023';
  END IF;
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot change your own role.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT role INTO v_old FROM profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account not found.' USING ERRCODE = '22023';
  END IF;
  IF v_old = p_role THEN
    RETURN;
  END IF;
  IF p_role = 'operator' AND NOT EXISTS (SELECT 1 FROM tours_operators WHERE profile_id = p_user_id) THEN
    RAISE EXCEPTION 'This account has no operator application. Ask them to register as an operator first.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_role = 'guide' AND NOT EXISTS (SELECT 1 FROM tours_guides WHERE profile_id = p_user_id) THEN
    RAISE EXCEPTION 'This account has no guide application. Ask them to register as a guide first.' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE profiles SET role = p_role WHERE id = p_user_id;
  INSERT INTO tours_admin_audit_log (admin_id, action, entity_type, entity_id, old_value, new_value)
  VALUES (auth.uid(), 'change_user_role', 'user', p_user_id, to_jsonb(v_old)::text, to_jsonb(p_role)::text);
END;
$$;
REVOKE ALL ON FUNCTION public.tours_admin_set_role(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tours_admin_set_role(uuid, text) TO authenticated;

/** Marks the account suspended (or not). The server action also bans sign-in with the service role. */
CREATE OR REPLACE FUNCTION public.tours_admin_set_suspended(p_user_id uuid, p_suspended boolean, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_old boolean;
BEGIN
  IF get_my_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only admins can suspend accounts.' USING ERRCODE = '42501';
  END IF;
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot suspend your own account.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT is_suspended INTO v_old FROM profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account not found.' USING ERRCODE = '22023';
  END IF;
  IF p_suspended AND char_length(btrim(COALESCE(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Give a reason for the suspension.' USING ERRCODE = '22023';
  END IF;
  UPDATE profiles
     SET is_suspended = p_suspended,
         suspended_at = CASE WHEN p_suspended THEN now() ELSE NULL END,
         suspended_reason = CASE WHEN p_suspended THEN left(btrim(p_reason), 300) ELSE NULL END
   WHERE id = p_user_id;
  INSERT INTO tours_admin_audit_log (admin_id, action, entity_type, entity_id, old_value, new_value, notes)
  VALUES (auth.uid(), CASE WHEN p_suspended THEN 'ban_user' ELSE 'unban_user' END, 'user', p_user_id,
          to_jsonb(v_old)::text, to_jsonb(p_suspended)::text, NULLIF(btrim(COALESCE(p_reason, '')), ''));
END;
$$;
REVOKE ALL ON FUNCTION public.tours_admin_set_suspended(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tours_admin_set_suspended(uuid, boolean, text) TO authenticated;
