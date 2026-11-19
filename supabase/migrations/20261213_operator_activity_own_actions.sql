-- Operator activity log, own actions only (20261213)
--
-- Replaces tours_operator_activity (20261212): the activity log (tours_activity_log, 20261211)
-- limited to what the calling operator did themselves, on their own records: their packages,
-- the bookings on them, payments recorded on those bookings, the guides on their packages,
-- and their guide applications. Changes by travellers, guides and the system are left out.
-- Same row shape as tours_admin_activity. Apply in the Supabase SQL editor.

CREATE OR REPLACE FUNCTION public.tours_operator_activity(
  p_entity text DEFAULT NULL, p_from date DEFAULT NULL, p_to date DEFAULT NULL,
  p_before timestamptz DEFAULT NULL, p_limit int DEFAULT 50
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_limit int := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_start timestamptz := CASE WHEN p_from IS NULL THEN '-infinity'::timestamptz ELSE p_from::timestamp AT TIME ZONE 'Asia/Manila' END;
  v_end timestamptz := CASE WHEN p_to IS NULL THEN 'infinity'::timestamptz ELSE (p_to + 1)::timestamp AT TIME ZONE 'Asia/Manila' END;
  v_op uuid;
BEGIN
  IF get_my_role() IS DISTINCT FROM 'operator' THEN RAISE EXCEPTION 'Operators only.' USING ERRCODE = '42501'; END IF;
  SELECT id INTO v_op FROM tours_operators WHERE profile_id = auth.uid();
  IF v_op IS NULL THEN RAISE EXCEPTION 'Operators only.' USING ERRCODE = '42501'; END IF;

  RETURN COALESCE((
    WITH my_pkgs AS (SELECT id::text AS id FROM tours_packages WHERE operator_id = v_op),
         my_bookings AS (SELECT b.id::text AS id FROM tours_bookings b WHERE b.package_id::text IN (SELECT id FROM my_pkgs))
    SELECT jsonb_agg(row_to_json(x)::jsonb ORDER BY x.at DESC) FROM (
      SELECT l.id::text AS id, l.at, l.actor_id, COALESCE(l.actor_role, 'system') AS actor_role,
             pr.full_name AS actor_name,
             l.action, l.entity, l.entity_id, l.changes, NULL::text AS notes
        FROM tours_activity_log l LEFT JOIN profiles pr ON pr.id = l.actor_id
       WHERE l.actor_id = auth.uid()
         AND l.at >= v_start AND l.at < v_end AND (p_before IS NULL OR l.at < p_before)
         AND (p_entity IS NULL OR p_entity = '' OR l.entity = p_entity)
         AND (
              (l.entity = 'tours_packages'
                 AND (l.entity_id IN (SELECT id FROM my_pkgs) OR l.changes ->> 'operator_id' = v_op::text))
           OR (l.entity = 'tours_bookings'
                 AND (l.entity_id IN (SELECT id FROM my_bookings) OR l.changes ->> 'package_id' IN (SELECT id FROM my_pkgs)))
           OR (l.entity = 'tours_payments'
                 AND (l.changes ->> 'booking_id' IN (SELECT id FROM my_bookings)
                      OR l.entity_id IN (SELECT p.id::text FROM tours_payments p WHERE p.booking_id::text IN (SELECT id FROM my_bookings))))
           OR (l.entity = 'tours_package_guides'
                 AND (l.changes ->> 'package_id' IN (SELECT id FROM my_pkgs)
                      OR l.entity_id IN (SELECT g.id::text FROM tours_package_guides g WHERE g.package_id::text IN (SELECT id FROM my_pkgs))))
           OR (l.entity = 'tours_guide_applications'
                 AND (l.changes ->> 'operator_id' = v_op::text
                      OR l.entity_id IN (SELECT a.id::text FROM tours_guide_applications a WHERE a.operator_id = v_op)))
         )
       ORDER BY l.at DESC LIMIT v_limit
    ) x
  ), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.tours_operator_activity(text, date, date, timestamptz, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tours_operator_activity(text, date, date, timestamptz, int) TO authenticated;
