-- F9: Role dashboards
-- 1. Guide availability is no longer public: only operators (to plan guide
--    assignments) and admins read it; guides still manage their own rows.
-- 2. tours_admin_analytics: municipal KPIs for the Tourism Office, admin only.
--    Operator revenue/occupancy reuse tables the operator can already read
--    under existing RLS, so they need no new function.

ALTER POLICY "Public views guide availability" ON public.tours_guide_availability
  TO authenticated
  USING (public.get_my_role() IN ('operator', 'admin'));
ALTER POLICY "Public views guide availability" ON public.tours_guide_availability
  RENAME TO "Operators view guide availability";
REVOKE ALL ON public.tours_guide_availability FROM anon;

-- ----------------------------------------------------------------
-- Admin analytics for an inclusive Manila date range [p_from, p_to]
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tours_admin_analytics(p_from date, p_to date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_start timestamptz;
  v_end timestamptz;
BEGIN
  IF public.get_my_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only Tourism Office admins can view analytics.' USING ERRCODE = '42501';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to - p_from > 366 THEN
    RAISE EXCEPTION 'Choose a date range of up to one year.' USING ERRCODE = '22023';
  END IF;
  v_start := p_from::timestamp AT TIME ZONE 'Asia/Manila';
  v_end := (p_to + 1)::timestamp AT TIME ZONE 'Asia/Manila';

  RETURN jsonb_build_object(
    'from', p_from,
    'to', p_to,
    -- Tourist arrivals: QR/manual check-ins per Manila day.
    'arrivals', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('day', d, 'checkins', n) ORDER BY d), '[]'::jsonb)
      FROM (
        SELECT (c.scanned_at AT TIME ZONE 'Asia/Manila')::date AS d, count(*)::int AS n
        FROM tours_checkins c
        WHERE c.scanned_at >= v_start AND c.scanned_at < v_end
        GROUP BY 1
      ) a
    ),
    -- Bookings made in the range, by outcome.
    'bookings', (
      SELECT jsonb_build_object(
        'total', count(*)::int,
        'pending', count(*) FILTER (WHERE b.status = 'pending')::int,
        'confirmed', count(*) FILTER (WHERE b.status = 'confirmed')::int,
        'completed', count(*) FILTER (WHERE b.status = 'completed')::int,
        'cancelled', count(*) FILTER (WHERE b.status = 'cancelled')::int,
        'rejected', count(*) FILTER (WHERE b.status = 'rejected')::int,
        'pax', coalesce(sum(b.number_of_pax) FILTER (WHERE b.status IN ('confirmed', 'completed')), 0)::int
      )
      FROM tours_bookings b
      WHERE b.created_at >= v_start AND b.created_at < v_end
    ),
    -- Per operator: bookings made in the range and money received in the range.
    'operators', (
      SELECT coalesce(jsonb_agg(row_to_json(o) ORDER BY o.revenue DESC, o.bookings DESC), '[]'::jsonb)
      FROM (
        SELECT op.id, op.business_name,
          (SELECT count(*) FROM tours_bookings b JOIN tours_packages p ON p.id = b.package_id
             WHERE p.operator_id = op.id AND b.created_at >= v_start AND b.created_at < v_end
               AND b.status <> 'rejected')::int AS bookings,
          (SELECT coalesce(sum(pay.amount), 0) FROM tours_payments pay
             JOIN tours_bookings b ON b.id = pay.booking_id JOIN tours_packages p ON p.id = b.package_id
             WHERE p.operator_id = op.id AND pay.payment_status = 'completed'
               AND pay.payment_date >= v_start AND pay.payment_date < v_end)::numeric AS revenue,
          (SELECT coalesce(sum(pay.amount), 0) FROM tours_payments pay
             JOIN tours_bookings b ON b.id = pay.booking_id JOIN tours_packages p ON p.id = b.package_id
             WHERE p.operator_id = op.id AND pay.payment_status = 'refunded'
               AND pay.payment_date >= v_start AND pay.payment_date < v_end)::numeric AS refunded
        FROM tours_operators op
        WHERE op.accreditation_status = 'approved'
      ) o
    ),
    'top_packages', (
      SELECT coalesce(jsonb_agg(row_to_json(t) ORDER BY t.bookings DESC, t.pax DESC), '[]'::jsonb)
      FROM (
        SELECT p.id, p.title, count(*)::int AS bookings, coalesce(sum(b.number_of_pax), 0)::int AS pax
        FROM tours_bookings b JOIN tours_packages p ON p.id = b.package_id
        WHERE b.created_at >= v_start AND b.created_at < v_end AND b.status NOT IN ('cancelled', 'rejected')
        GROUP BY p.id, p.title
        ORDER BY bookings DESC, pax DESC
        LIMIT 5
      ) t
    ),
    -- Attractions most often added to trip plans saved in the range.
    'top_attractions', (
      SELECT coalesce(jsonb_agg(row_to_json(t) ORDER BY t.planned DESC), '[]'::jsonb)
      FROM (
        SELECT a.id, a.name, a.slug, count(*)::int AS planned
        FROM tours_itinerary_items i
        JOIN tours_itineraries it ON it.id = i.itinerary_id
        JOIN tours_attractions a ON a.id = i.attraction_id
        WHERE it.created_at >= v_start AND it.created_at < v_end
        GROUP BY a.id, a.name, a.slug
        ORDER BY planned DESC
        LIMIT 5
      ) t
    ),
    -- Accreditation queue right now (not limited to the range).
    'queue', (
      SELECT coalesce(jsonb_agg(row_to_json(q) ORDER BY q.waiting_days DESC), '[]'::jsonb)
      FROM (
        SELECT 'operator' AS kind, op.id, op.business_name AS name,
          (current_date - (op.created_at AT TIME ZONE 'Asia/Manila')::date)::int AS waiting_days
        FROM tours_operators op WHERE op.accreditation_status = 'pending'
        UNION ALL
        SELECT 'guide', g.id, coalesce(pr.full_name, 'Guide applicant'),
          (current_date - (g.created_at AT TIME ZONE 'Asia/Manila')::date)::int
        FROM tours_guides g LEFT JOIN profiles pr ON pr.id = g.profile_id
        WHERE g.accreditation_status = 'pending'
      ) q
    ),
    'ratings', (
      SELECT jsonb_agg(jsonb_build_object('stars', s, 'count',
        (SELECT count(*) FROM tours_reviews r
          WHERE r.rating = s AND NOT r.is_hidden AND r.created_at >= v_start AND r.created_at < v_end)::int) ORDER BY s DESC)
      FROM generate_series(1, 5) s
    )
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.tours_admin_analytics(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tours_admin_analytics(date, date) TO authenticated;
