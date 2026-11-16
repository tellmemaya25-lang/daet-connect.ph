-- Applied to production on 2026-11-13. The owner then chose that the
-- operator approves the admin's guide, so the app keeps using
-- tours_admin_propose_guide(); tours_admin_assign_guide() below is unused.
-- guide_assigned_by still records who assigned each guide (an operator who
-- approves a proposal counts as 'operator', so the lock below never applies
-- to proposals).
--
--  * tours_bookings.guide_assigned_by: who put the current guide on the tour
--    ('admin', 'operator' or 'system'), set by the guide-fee trigger.
--  * tours_admin_assign_guide(): admin assigns a named guide, or with NULL the
--    best free guide (package guides first, then the municipality).
--  * A guide the admin assigned can only be changed or removed by an admin;
--    cancelling or calling off the tour is unaffected.

ALTER TABLE public.tours_bookings
  ADD COLUMN IF NOT EXISTS guide_assigned_by text CHECK (guide_assigned_by IN ('admin', 'operator', 'system'));

ALTER TABLE public.tours_admin_audit_log DROP CONSTRAINT IF EXISTS valid_action;
ALTER TABLE public.tours_admin_audit_log ADD CONSTRAINT valid_action CHECK (action = ANY (ARRAY[
  'approve_operator', 'reject_operator', 'approve_guide', 'reject_guide', 'update_package_status',
  'delete_package', 'ban_user', 'unban_user', 'change_user_role', 'set_guide_areas', 'propose_guide',
  'set_package_guides', 'assign_guide'
]));

/** The guide fee, the settled proposal, and who assigned the guide. */
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
  -- An admin's assignment is theirs to change; the tour can still be cancelled.
  IF OLD.guide_assigned_by = 'admin' AND OLD.assigned_guide_id IS NOT NULL
     AND auth.uid() IS NOT NULL AND get_my_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'The Tourism Office assigned this guide. Message them to change it.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.assigned_guide_id IS NULL THEN
    NEW.guide_fee := NULL;
    NEW.guide_assigned_by := NULL;
    IF NEW.guide_proposal_status = 'approved' THEN
      NEW.guide_proposal_status := NULL;
      NEW.proposed_guide_id := NULL;
    END IF;
  ELSE
    SELECT guide_fee INTO NEW.guide_fee FROM tours_packages WHERE id = NEW.package_id;
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

/**
 * Admin assigns a guide to an upcoming booking, straight away: a named guide
 * (who must be free that day), or with NULL the best free guide for the
 * package. Returns the guide's id, or NULL when nobody is free.
 */
CREATE OR REPLACE FUNCTION public.tours_admin_assign_guide(p_booking_id uuid, p_guide_id uuid)
RETURNS uuid
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
    RAISE EXCEPTION 'Only admins can assign guides here.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO b FROM tours_bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND OR b.status NOT IN ('pending', 'confirmed') THEN
    RAISE EXCEPTION 'Only pending or confirmed bookings can get a guide.' USING ERRCODE = 'check_violation';
  END IF;
  IF v_guide IS NULL THEN
    v_guide := tours_pick_guide(b.package_id, b.tour_date, b.id, b.rejected_guide_ids);
    IF v_guide IS NULL THEN
      UPDATE tours_bookings
         SET proposed_guide_id = NULL, guide_proposal_status = 'none_available', guide_proposed_by = 'admin', guide_proposed_at = now()
       WHERE id = p_booking_id AND assigned_guide_id IS NULL;
      RETURN NULL;
    END IF;
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
  -- The guide-fee trigger records the fee and that an admin assigned the guide;
  -- the schedule trigger re-checks the guide is free; the guest and guide are notified.
  UPDATE tours_bookings
     SET assigned_guide_id = v_guide,
         guide_proposed_by = 'admin',
         guide_proposed_at = now()
   WHERE id = p_booking_id;
  INSERT INTO tours_admin_audit_log (admin_id, action, entity_type, entity_id, old_value, new_value)
  VALUES (auth.uid(), 'assign_guide', 'booking', p_booking_id, to_jsonb(b.assigned_guide_id)::text, to_jsonb(v_guide)::text);
  RETURN v_guide;
END;
$$;
REVOKE ALL ON FUNCTION public.tours_admin_assign_guide(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tours_admin_assign_guide(uuid, uuid) TO authenticated;
