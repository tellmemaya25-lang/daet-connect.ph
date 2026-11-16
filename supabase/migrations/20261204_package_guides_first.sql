-- Each package has its own guides (owner's follow-up to items 8 and 9).
--
-- tours_package_guides already links guides to packages (unique per pair).
-- Admins now pick each package's guides on Guide assignments, and the
-- automatic proposal tries that package's own guides first, then any free
-- guide who serves the package's municipality, so a tour still gets a guide
-- when its own guides are all busy that day.

ALTER TABLE public.tours_admin_audit_log DROP CONSTRAINT IF EXISTS valid_action;
ALTER TABLE public.tours_admin_audit_log ADD CONSTRAINT valid_action CHECK (action = ANY (ARRAY[
  'approve_operator', 'reject_operator', 'approve_guide', 'reject_guide', 'update_package_status',
  'delete_package', 'ban_user', 'unban_user', 'change_user_role', 'set_guide_areas', 'propose_guide',
  'set_package_guides'
]));

/** Replaces a package's guides (admin). Only approved guides can be listed. */
CREATE OR REPLACE FUNCTION public.tours_admin_set_package_guides(p_package_id uuid, p_guide_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_old uuid[];
  v_new uuid[];
BEGIN
  IF get_my_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only admins can choose a package''s guides.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM tours_packages WHERE id = p_package_id) THEN
    RAISE EXCEPTION 'Package not found.' USING ERRCODE = '22023';
  END IF;
  SELECT COALESCE(array_agg(DISTINCT g), '{}') INTO v_new FROM unnest(COALESCE(p_guide_ids, '{}')) g;
  IF array_length(v_new, 1) > 20 THEN
    RAISE EXCEPTION 'Choose up to 20 guides for a package.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_new) g WHERE NOT EXISTS (SELECT 1 FROM tours_guides t WHERE t.id = g AND t.accreditation_status = 'approved')) THEN
    RAISE EXCEPTION 'Only approved guides can be chosen.' USING ERRCODE = '22023';
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

/**
 * The guide to propose for a booking: approved, free that day, not rejected
 * for this booking and not proposed for another tour that day. The package's
 * own guides come first, then guides serving its municipality; within each,
 * the least busy over the last 30 days.
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
   WHERE g.accreditation_status = 'approved'
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

/** A package can get a proposal once it has its own guides or a municipality. */
CREATE OR REPLACE FUNCTION public.tours_package_has_guide_pool(p_package_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (SELECT 1 FROM tours_packages WHERE id = p_package_id AND municipality IS NOT NULL)
      OR EXISTS (SELECT 1 FROM tours_package_guides WHERE package_id = p_package_id AND is_active);
$$;
REVOKE ALL ON FUNCTION public.tours_package_has_guide_pool(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.tours_bookings_pickup_and_guide()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_point tours_package_pickup_points%ROWTYPE;
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

  IF NEW.guide_not_needed_at IS NULL AND tours_package_has_guide_pool(NEW.package_id) THEN
    v_guide := tours_pick_guide(NEW.package_id, NEW.tour_date, NEW.id, '{}');
    NEW.proposed_guide_id := v_guide;
    NEW.guide_proposal_status := CASE WHEN v_guide IS NULL THEN 'none_available' ELSE 'proposed' END;
    NEW.guide_proposed_by := 'auto';
    NEW.guide_proposed_at := now();
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tours_bookings_pickup_and_guide() FROM PUBLIC, anon, authenticated;

/** Admin board, now with each published package's own guides. */
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
                               WHERE pg.package_id = p.id AND pg.is_active AND g.accreditation_status = 'approved'), '[]'::jsonb)
      ) ORDER BY p.title, op.business_name), '[]'::jsonb)
      FROM tours_packages p JOIN tours_operators op ON op.id = p.operator_id
      WHERE p.status = 'published'
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
