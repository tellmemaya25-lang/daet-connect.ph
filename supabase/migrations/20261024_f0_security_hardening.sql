-- ================================================================
-- F0 / D1 + D6: resubmission of rejected packages, function hardening
-- Run after 20261024_f0_package_status_rejected.sql.
-- ================================================================

-- ----------------------------------------------------------------
-- Rejected packages can be resubmitted for review.
-- Same checks as before; the status gate now accepts 'rejected' and the
-- previous reviewer note is cleared on resubmission.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_package_for_review(p_package_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_variant_count int;
  v_default_count int;
  v_stop_count int;
begin
  if not exists (
    select 1
    from tours_packages p
    join tours_operators o on o.id = p.operator_id
    where p.id = p_package_id
      and o.profile_id = auth.uid()
      and o.accreditation_status = 'approved'
      and p.status in ('draft', 'rejected')
  ) then
    raise exception 'Not authorized to submit this package, or package is not in draft or rejected status.';
  end if;

  select count(*), count(*) filter (where is_default)
    into v_variant_count, v_default_count
  from tours_package_price_variants
  where package_id = p_package_id;

  if v_variant_count = 0 then
    raise exception 'Add at least one price variant before submitting.';
  end if;
  if v_default_count <> 1 then
    raise exception 'Set exactly one price variant as the default before submitting.';
  end if;

  select count(*) into v_stop_count
  from tours_package_stops
  where package_id = p_package_id;

  if v_stop_count = 0 then
    raise exception 'Add at least one map stop before submitting.';
  end if;

  update tours_packages
     set status = 'pending_review',
         rejection_reason = null,
         updated_at = now()
   where id = p_package_id
     and status in ('draft', 'rejected');
end;
$$;

-- ----------------------------------------------------------------
-- Pin search_path on every public function (advisor 0011).
-- None of these bodies reference objects outside public/pg_catalog/auth
-- (auth.uid() is schema-qualified), so `public` is sufficient.
-- ----------------------------------------------------------------
ALTER FUNCTION public.generate_booking_reference() SET search_path = public;
ALTER FUNCTION public.update_updated_at_column() SET search_path = public;
ALTER FUNCTION public.set_updated_at() SET search_path = public;
ALTER FUNCTION public.update_updated_at() SET search_path = public;
ALTER FUNCTION public.update_booking_payment_status() SET search_path = public;
ALTER FUNCTION public.get_my_role() SET search_path = public;
ALTER FUNCTION public.replace_package_price_variants(uuid, jsonb) SET search_path = public;
ALTER FUNCTION public.replace_package_stops(uuid, jsonb) SET search_path = public;

-- ----------------------------------------------------------------
-- handle_new_user() only runs as the on_auth_user_created trigger.
-- Trigger execution does not check EXECUTE privilege, so nobody needs to
-- call it over /rest/v1/rpc (advisors 0028/0029).
-- ----------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------
-- Intentionally NOT changed:
-- * get_my_role() stays executable by anon. About 14 admin RLS policies are
--   granted TO public (which includes anon) and call get_my_role(); anonymous
--   reads such as /tours/browse evaluate them, so revoking anon would break
--   public pages. For anon it returns 'tourist', which grants nothing.
-- * tours_guide_sensitive_info keeps RLS with no policies on purpose: only
--   the server-side service-role client may read or write it.
-- * replace_package_price_variants / replace_package_stops do not check
--   package status, so an owner could call them directly on a published
--   package. Tracked for F2 (booking integrity) together with the lifecycle.
-- ----------------------------------------------------------------
