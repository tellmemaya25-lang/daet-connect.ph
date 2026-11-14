-- Operator guide management (owner's request):
--  * Operators rank each package's guides (tours_package_guides.priority).
--  * The automatic pick weighs: knows the place (the package's own guides,
--    then guides serving its municipality), fewest tours in the last 30 days,
--    the operator's ranking, then the guide's rating.
--  * An operator switch (auto_assign_guides) assigns the picked guide to new
--    bookings straight away instead of proposing them for approval.
--  * tours_operator_guide_stats(): each team guide's availability, load,
--    earnings and the revenue of the tours they led, for the Guides page.

ALTER TABLE public.tours_operators ADD COLUMN IF NOT EXISTS auto_assign_guides boolean NOT NULL DEFAULT false;
ALTER TABLE public.tours_package_guides ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 100 CHECK (priority BETWEEN 1 AND 1000);

/** The operator turns automatic assignment on or off. */
CREATE OR REPLACE FUNCTION public.tours_operator_set_auto_assign(p_on boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_operator uuid := tours_my_approved_operator_id();
BEGIN
  IF v_operator IS NULL THEN
    RAISE EXCEPTION 'Only approved operators can change this.' USING ERRCODE = '42501';
  END IF;
  UPDATE tours_operators SET auto_assign_guides = COALESCE(p_on, false) WHERE id = v_operator;
END;
$$;
REVOKE ALL ON FUNCTION public.tours_operator_set_auto_assign(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tours_operator_set_auto_assign(boolean) TO authenticated;

/** The operator's ranked guides for one of their packages: first in the list, first choice. Team guides only. */
CREATE OR REPLACE FUNCTION public.tours_operator_set_package_guides(p_package_id uuid, p_guide_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_operator uuid := tours_my_approved_operator_id();
  v_new uuid[];
BEGIN
  IF v_operator IS NULL OR NOT EXISTS (SELECT 1 FROM tours_packages WHERE id = p_package_id AND operator_id = v_operator) THEN
    RAISE EXCEPTION 'Package not found.' USING ERRCODE = '42501';
  END IF;
  -- Keep the first place of a guide named twice.
  SELECT COALESCE(array_agg(g ORDER BY first_pos), '{}') INTO v_new
    FROM (SELECT g, min(pos) AS first_pos FROM unnest(COALESCE(p_guide_ids, '{}')) WITH ORDINALITY AS t(g, pos) GROUP BY g) x;
  IF array_length(v_new, 1) > 20 THEN
    RAISE EXCEPTION 'Choose up to 20 guides for a package.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_new) g WHERE NOT tours_guide_works_for(g, v_operator)) THEN
    RAISE EXCEPTION 'Only guides on your team can be chosen.' USING ERRCODE = '22023';
  END IF;
  UPDATE tours_package_guides SET is_active = false WHERE package_id = p_package_id AND NOT (guide_id = ANY (v_new));
  INSERT INTO tours_package_guides (package_id, guide_id, is_active, priority)
  SELECT p_package_id, g, true, pos::int FROM unnest(v_new) WITH ORDINALITY AS t(g, pos)
  ON CONFLICT (package_id, guide_id) DO UPDATE SET is_active = true, priority = EXCLUDED.priority;
END;
$$;
REVOKE ALL ON FUNCTION public.tours_operator_set_package_guides(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tours_operator_set_package_guides(uuid, uuid[]) TO authenticated;

/** Admin version (from 20261207), now keeping the order as the ranking. */
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
  SELECT COALESCE(array_agg(g ORDER BY first_pos), '{}') INTO v_new
    FROM (SELECT g, min(pos) AS first_pos FROM unnest(COALESCE(p_guide_ids, '{}')) WITH ORDINALITY AS t(g, pos) GROUP BY g) x;
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
  UPDATE tours_package_guides SET is_active = false WHERE package_id = p_package_id AND NOT (guide_id = ANY (v_new));
  INSERT INTO tours_package_guides (package_id, guide_id, is_active, priority)
  SELECT p_package_id, g, true, pos::int FROM unnest(v_new) WITH ORDINALITY AS t(g, pos)
  ON CONFLICT (package_id, guide_id) DO UPDATE SET is_active = true, priority = EXCLUDED.priority;
  INSERT INTO tours_admin_audit_log (admin_id, action, entity_type, entity_id, old_value, new_value)
  VALUES (auth.uid(), 'set_package_guides', 'package', p_package_id, to_jsonb(v_old)::text, to_jsonb(v_new)::text);
END;
$$;
REVOKE ALL ON FUNCTION public.tours_admin_set_package_guides(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tours_admin_set_package_guides(uuid, uuid[]) TO authenticated;

/**
 * The automatic pick (from 20261207), from the tour operator's team only:
 *   1. knows the place: the package's own guides, then guides serving its municipality;
 *   2. fewest of this operator's tours assigned to them in the 30 days before the
 *      tour (pending ones count: they're work too), which spreads the work;
 *   3. the operator's ranking on the package;
 *   4. higher rating (guides without reviews after rated ones);
 *   then the longest-standing guide.
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
    LEFT JOIN tours_package_guides pg ON pg.package_id = p.id AND pg.guide_id = g.id AND pg.is_active
    LEFT JOIN tours_guide_ratings r ON r.guide_id = g.id
   WHERE g.accreditation_status = 'approved'
     AND tours_guide_works_for(g.id, p.operator_id)
     AND (
       pg.guide_id IS NOT NULL
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
     pg.guide_id IS NULL,
     (SELECT count(*) FROM tours_bookings w JOIN tours_packages wp ON wp.id = w.package_id
       WHERE w.assigned_guide_id = g.id AND wp.operator_id = p.operator_id
         AND w.status IN ('pending', 'confirmed', 'completed')
         AND w.tour_date >= p_date - 30 AND w.tour_date <= p_date),
     COALESCE(pg.priority, 1000),
     CASE WHEN COALESCE(r.review_count, 0) > 0 THEN r.average_rating END DESC NULLS LAST,
     g.created_at, g.id
   LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.tours_pick_guide(uuid, date, uuid, uuid[]) FROM PUBLIC, anon, authenticated;

/** Guide fee and lock (from 20261207); an automatic assignment is recorded as 'system'. */
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
      WHEN auth.uid() IS NULL OR current_setting('tours.auto_assign', true) = 'on' THEN 'system'
      WHEN get_my_role() = 'admin' THEN 'admin'
      ELSE 'operator' END;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tours_bookings_guide_fee() FROM PUBLIC, anon, authenticated;

/**
 * Auto-assign: for an operator with the switch on, the guide picked for a new
 * booking is assigned straight away (through the guide-fee trigger, so the fee
 * and the team rule apply, and the guest and guide are notified). If anything
 * stops it, the pick stays a proposal for the operator, and the booking still goes through.
 */
CREATE OR REPLACE FUNCTION public.tours_bookings_auto_assign()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.guide_proposal_status = 'proposed' AND NEW.proposed_guide_id IS NOT NULL AND NEW.assigned_guide_id IS NULL
     AND NEW.status IN ('pending', 'confirmed')
     AND EXISTS (SELECT 1 FROM tours_packages p JOIN tours_operators o ON o.id = p.operator_id
                  WHERE p.id = NEW.package_id AND o.auto_assign_guides) THEN
    PERFORM set_config('tours.auto_assign', 'on', true);
    BEGIN
      UPDATE tours_bookings SET assigned_guide_id = NEW.proposed_guide_id WHERE id = NEW.id;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
    PERFORM set_config('tours.auto_assign', 'off', true);
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.tours_bookings_auto_assign() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_tours_bookings_auto_assign ON public.tours_bookings;
CREATE TRIGGER trg_tours_bookings_auto_assign
  AFTER INSERT ON public.tours_bookings
  FOR EACH ROW EXECUTE FUNCTION public.tours_bookings_auto_assign();

/**
 * The operator's team for the Guides page: per guide, the next 30 days'
 * availability, recent load, tours, earnings and revenue in the range, rating,
 * and the operator's packages they're listed on or have led. Plus the
 * operator's packages with their ranked guides, and the auto-assign switch.
 */
CREATE OR REPLACE FUNCTION public.tours_operator_guide_stats(p_from date, p_to date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_operator uuid := tours_my_approved_operator_id();
  v_today date := (now() AT TIME ZONE 'Asia/Manila')::date;
BEGIN
  IF v_operator IS NULL THEN
    RAISE EXCEPTION 'Only approved operators can see this.' USING ERRCODE = '42501';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to - p_from > 400 THEN
    RAISE EXCEPTION 'Choose a range of up to 400 days.' USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object(
    'auto_assign', (SELECT auto_assign_guides FROM tours_operators WHERE id = v_operator),
    'guides', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', g.id,
        'name', COALESCE(NULLIF(btrim(pr.full_name), ''), 'Guide'),
        'share_pct', a.revenue_share_pct,
        'free_days_30', (SELECT count(*) FROM tours_guide_availability av
                           WHERE av.guide_id = g.id AND av.is_available AND av.available_date BETWEEN v_today AND v_today + 29
                             AND NOT EXISTS (SELECT 1 FROM tours_bookings x WHERE x.assigned_guide_id = g.id AND x.tour_date = av.available_date AND x.status IN ('pending', 'confirmed'))),
        'upcoming', (SELECT count(*) FROM tours_bookings b JOIN tours_packages p ON p.id = b.package_id
                      WHERE b.assigned_guide_id = g.id AND p.operator_id = v_operator AND b.status IN ('pending', 'confirmed') AND b.tour_date >= v_today),
        'tours_30', (SELECT count(*) FROM tours_bookings b JOIN tours_packages p ON p.id = b.package_id
                      WHERE b.assigned_guide_id = g.id AND p.operator_id = v_operator AND b.status IN ('pending', 'confirmed', 'completed')
                        AND b.tour_date BETWEEN v_today - 30 AND v_today),
        'completed', s.completed,
        'earned', s.earned,
        'revenue', s.revenue,
        'rating', CASE WHEN COALESCE(r.review_count, 0) > 0 THEN r.average_rating END,
        'reviews', COALESCE(r.review_count, 0),
        'listed_package_ids', COALESCE((SELECT jsonb_agg(pg.package_id) FROM tours_package_guides pg JOIN tours_packages p ON p.id = pg.package_id
                                          WHERE pg.guide_id = g.id AND pg.is_active AND p.operator_id = v_operator), '[]'::jsonb),
        'led_package_ids', COALESCE((SELECT jsonb_agg(DISTINCT b.package_id) FROM tours_bookings b JOIN tours_packages p ON p.id = b.package_id
                                       WHERE b.assigned_guide_id = g.id AND p.operator_id = v_operator AND b.status IN ('confirmed', 'completed')), '[]'::jsonb)
      ) ORDER BY pr.full_name), '[]'::jsonb)
      FROM tours_guide_applications a
      JOIN tours_guides g ON g.id = a.guide_id
      LEFT JOIN profiles pr ON pr.id = g.profile_id
      LEFT JOIN tours_guide_ratings r ON r.guide_id = g.id
      CROSS JOIN LATERAL (
        SELECT count(*)::int AS completed, COALESCE(sum(b.guide_fee), 0) AS earned, COALESCE(sum(b.total_amount), 0) AS revenue
          FROM tours_bookings b JOIN tours_packages p ON p.id = b.package_id
         WHERE b.assigned_guide_id = g.id AND p.operator_id = v_operator AND b.status = 'completed'
           AND b.tour_date BETWEEN p_from AND p_to
      ) s
      WHERE a.operator_id = v_operator AND a.status = 'active'
    ),
    'packages', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', p.id, 'title', p.title,
        'guide_ids', COALESCE((SELECT jsonb_agg(pg.guide_id ORDER BY pg.priority, pg.guide_id) FROM tours_package_guides pg
                                WHERE pg.package_id = p.id AND pg.is_active AND tours_guide_works_for(pg.guide_id, v_operator)), '[]'::jsonb)
      ) ORDER BY p.title), '[]'::jsonb)
      FROM tours_packages p
      WHERE p.operator_id = v_operator AND p.status <> 'archived'
    )
  );
END;
$$;
REVOKE ALL ON FUNCTION public.tours_operator_guide_stats(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tours_operator_guide_stats(date, date) TO authenticated;
