-- Once a tour's guide is approved, the operator can't pick another one
-- (owner's follow-up: "after the operator approved the tour guide, it's no
-- longer possible to choose another tour guide").
--
-- A non-admin can still:
--   * hand the tour to another guide through an approved swap request (the
--     guide asked; tours_decide_guide_swap approves it in the same transaction);
--   * record that the guest needs no guide, which takes the guide off.
-- Admins can always change the guide. System updates (no signed-in user) are
-- unaffected.

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
