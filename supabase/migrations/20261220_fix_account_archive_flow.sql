-- Archive accounts in the same database transaction as the suspension.
-- This migration replaces the earlier archive functions, including on databases
-- where the earlier migration was applied manually.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE OR REPLACE FUNCTION public.tours_admin_suspend_and_archive(p_user_id uuid, p_suspended boolean, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Reuse the existing authorization, reason validation and audit logging.
  PERFORM public.tours_admin_set_suspended(p_user_id, p_suspended, p_reason);
  UPDATE public.profiles
     SET archived_at = CASE WHEN p_suspended THEN COALESCE(archived_at, now()) ELSE NULL END,
         suspended_until = NULL
   WHERE id = p_user_id;
END;
$$;
REVOKE ALL ON FUNCTION public.tours_admin_suspend_and_archive(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tours_admin_suspend_and_archive(uuid, boolean, text) TO authenticated;

-- Both views use the same row shape and pagination. Archived accounts do not
-- appear in the ordinary accounts list or its counts.
CREATE OR REPLACE FUNCTION public.tours_admin_list_accounts(p_query text, p_role text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  v_q text := NULLIF(btrim(COALESCE(p_query, '')), '');
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
BEGIN
  IF public.get_my_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only admins can manage accounts.' USING ERRCODE = '42501';
  END IF;
  RETURN (
    WITH matched AS (
      SELECT pr.id, pr.full_name, pr.role, pr.created_at, pr.is_suspended, pr.suspended_at, pr.suspended_reason,
             pr.archived_at, u.email::text AS email, u.last_sign_in_at,
             EXISTS (SELECT 1 FROM tours_operators o WHERE o.profile_id = pr.id) AS has_operator,
             EXISTS (SELECT 1 FROM tours_guides g WHERE g.profile_id = pr.id) AS has_guide
        FROM profiles pr LEFT JOIN auth.users u ON u.id = pr.id
       WHERE (CASE WHEN p_role = 'archived' THEN pr.archived_at IS NOT NULL ELSE pr.archived_at IS NULL END)
         AND (p_role IS NULL OR p_role = '' OR p_role = 'archived' OR pr.role = p_role OR (p_role = 'suspended' AND pr.is_suspended))
         AND (v_q IS NULL OR pr.full_name ILIKE '%' || v_q || '%' OR u.email ILIKE '%' || v_q || '%')
    )
    SELECT jsonb_build_object(
      'total', (SELECT count(*) FROM matched)::int,
      'counts', (SELECT jsonb_object_agg(role, n) FROM (SELECT role, count(*)::int n FROM profiles WHERE archived_at IS NULL GROUP BY role) c),
      'accounts', COALESCE((SELECT jsonb_agg(row_to_json(m) ORDER BY m.created_at DESC) FROM (
        SELECT * FROM matched ORDER BY created_at DESC LIMIT v_limit OFFSET GREATEST(COALESCE(p_offset, 0), 0)
      ) m), '[]'::jsonb)
    )
  );
END;
$$;
REVOKE ALL ON FUNCTION public.tours_admin_list_accounts(text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tours_admin_list_accounts(text, text, integer, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.tours_admin_list_archived_accounts(p_query text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.tours_admin_list_accounts(p_query, 'archived', p_limit, p_offset);
$$;
REVOKE ALL ON FUNCTION public.tours_admin_list_archived_accounts(text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tours_admin_list_archived_accounts(text, integer, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.tours_admin_restore_account(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.get_my_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only admins can restore accounts.' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM profiles WHERE id = p_user_id AND archived_at IS NOT NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Account is not archived.' USING ERRCODE = '22023'; END IF;
  PERFORM public.tours_admin_suspend_and_archive(p_user_id, false, '');
END;
$$;
REVOKE ALL ON FUNCTION public.tours_admin_restore_account(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tours_admin_restore_account(uuid) TO authenticated;

-- Delete auth and profile together so a failed deletion cannot orphan a login.
CREATE OR REPLACE FUNCTION public.tours_admin_delete_account(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  IF public.get_my_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only admins can delete accounts.' USING ERRCODE = '42501';
  END IF;
  IF p_user_id = auth.uid() THEN RAISE EXCEPTION 'You cannot delete your own account.' USING ERRCODE = '22023'; END IF;
  PERFORM 1 FROM public.profiles WHERE id = p_user_id AND archived_at IS NOT NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Account is not archived.' USING ERRCODE = '22023'; END IF;
  DELETE FROM auth.users WHERE id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Auth account not found.' USING ERRCODE = '22023'; END IF;
  DELETE FROM public.profiles WHERE id = p_user_id;
END;
$$;
REVOKE ALL ON FUNCTION public.tours_admin_delete_account(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tours_admin_delete_account(uuid) TO authenticated;
