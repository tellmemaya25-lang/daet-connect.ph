-- Guide activity log, own actions only (20261220)
--
-- Replaces tours_guide_activity (20261219): only entries the calling guide made themselves
-- (actor_id = auth.uid()), on the records below. Operators' and admins' actions are left out.
-- tours_guide_activity: the activity log (tours_activity_log, 20261211) limited to the
-- calling guide's own records: bookings assigned to them, their operator applications,
-- their swap requests (sent or received) and their schedule. Same row shape as
-- tours_admin_activity. Tourists' names are not returned.
-- Apply in the Supabase SQL editor.

CREATE OR REPLACE FUNCTION public.tours_guide_activity(
  p_entity text DEFAULT NULL, p_from date DEFAULT NULL, p_to date DEFAULT NULL,
  p_before timestamptz DEFAULT NULL, p_limit int DEFAULT 50
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_limit int := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_start timestamptz := CASE WHEN p_from IS NULL THEN '-infinity'::timestamptz ELSE p_from::timestamp AT TIME ZONE 'Asia/Manila' END;
  v_end timestamptz := CASE WHEN p_to IS NULL THEN 'infinity'::timestamptz ELSE (p_to + 1)::timestamp AT TIME ZONE 'Asia/Manila' END;
  v_guide uuid;
BEGIN
  IF get_my_role() IS DISTINCT FROM 'guide' THEN RAISE EXCEPTION 'Guides only.' USING ERRCODE = '42501'; END IF;
  SELECT id INTO v_guide FROM tours_guides WHERE profile_id = auth.uid();
  IF v_guide IS NULL THEN RAISE EXCEPTION 'Guides only.' USING ERRCODE = '42501'; END IF;

  RETURN COALESCE((
    WITH my_bookings AS (SELECT id::text AS id FROM tours_bookings WHERE assigned_guide_id = v_guide)
    SELECT jsonb_agg(row_to_json(x)::jsonb ORDER BY x.at DESC) FROM (
      SELECT l.id::text AS id, l.at, l.actor_id, COALESCE(l.actor_role, 'system') AS actor_role,
             CASE WHEN l.actor_role = 'tourist' THEN NULL ELSE pr.full_name END AS actor_name,
             l.action, l.entity, l.entity_id, l.changes, NULL::text AS notes
        FROM tours_activity_log l LEFT JOIN profiles pr ON pr.id = l.actor_id
       WHERE l.at >= v_start AND l.at < v_end AND (p_before IS NULL OR l.at < p_before)
         AND l.actor_id = auth.uid()
         AND (p_entity IS NULL OR p_entity = '' OR l.entity = p_entity)
         AND (
              (l.entity = 'tours_bookings'
                 AND (l.entity_id IN (SELECT id FROM my_bookings) OR l.changes ->> 'assigned_guide_id' = v_guide::text))
           OR (l.entity = 'tours_guide_applications'
                 AND (l.changes ->> 'guide_id' = v_guide::text
                      OR l.entity_id IN (SELECT a.id::text FROM tours_guide_applications a WHERE a.guide_id = v_guide)))
           OR (l.entity = 'tours_guide_swap_requests'
                 AND (l.changes ->> 'from_guide_id' = v_guide::text OR l.changes ->> 'to_guide_id' = v_guide::text
                      OR l.entity_id IN (SELECT s.id::text FROM tours_guide_swap_requests s WHERE s.from_guide_id = v_guide OR s.to_guide_id = v_guide)))
           OR (l.entity = 'tours_guide_availability'
                 AND (l.changes ->> 'guide_id' = v_guide::text
                      OR l.entity_id IN (SELECT v.id::text FROM tours_guide_availability v WHERE v.guide_id = v_guide)))
         )
       ORDER BY l.at DESC LIMIT v_limit
    ) x
  ), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.tours_guide_activity(text, date, date, timestamptz, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tours_guide_activity(text, date, date, timestamptz, int) TO authenticated;
