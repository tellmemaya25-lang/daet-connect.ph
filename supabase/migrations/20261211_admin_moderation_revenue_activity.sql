-- Admin: reports and bans, review watch, comprehensive revenue, activity log,
-- and guide picking without municipalities (the site covers Daet only).
--
-- 1. tours_reports: anyone signed in reports a review, an account or a
--    package. Admins dismiss or act (hide the review, ban the account), and
--    the reporter is told. One open report per reporter and target.
-- 2. Timed bans: profiles.suspended_until on top of the existing suspension
--    (tours_admin_set_suspended + the Supabase Auth ban the server action sets).
-- 3. tours_admin_review_watch: operators and guides by low (1-2 star) reviews.
-- 4. tours_admin_revenue: month by month, payment methods, booking outcomes,
--    top packages.
-- 5. tours_activity_log: one row per insert/update/delete on the tables every
--    dashboard writes, with who did it; tours_admin_activity reads it (with the
--    admin audit log) a page at a time.
-- 6. tours_pick_guide: any guide on the operator's team; the package's own
--    guides first. Service areas no longer decide anything.

-- 1. Reports ---------------------------------------------------------------------

-- The admin audit log accepts the new actions.
ALTER TABLE public.tours_admin_audit_log DROP CONSTRAINT IF EXISTS valid_action;
ALTER TABLE public.tours_admin_audit_log ADD CONSTRAINT valid_action CHECK (action = ANY (ARRAY[
  'approve_operator', 'reject_operator', 'approve_guide', 'reject_guide', 'update_package_status', 'delete_package',
  'ban_user', 'unban_user', 'change_user_role', 'set_guide_areas', 'propose_guide', 'set_package_guides', 'assign_guide',
  'resolve_report', 'hide_review', 'show_review']));
ALTER TABLE public.tours_admin_audit_log DROP CONSTRAINT IF EXISTS valid_entity_type;
ALTER TABLE public.tours_admin_audit_log ADD CONSTRAINT valid_entity_type CHECK (entity_type = ANY (ARRAY[
  'operator', 'guide', 'package', 'user', 'booking', 'report', 'review']));

CREATE TABLE IF NOT EXISTS public.tours_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('review', 'profile', 'package')),
  target_id uuid NOT NULL,
  target_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reason text NOT NULL CHECK (reason IN ('spam', 'abuse', 'fake', 'unsafe', 'scam', 'other')),
  details text CHECK (char_length(details) <= 1000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'actioned', 'dismissed')),
  resolution_note text CHECK (char_length(resolution_note) <= 500),
  resolved_by uuid REFERENCES public.profiles(id),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tours_reports_open
  ON public.tours_reports (reporter_id, target_type, target_id) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_tours_reports_status ON public.tours_reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tours_reports_target_profile ON public.tours_reports (target_profile_id) WHERE status = 'open';

ALTER TABLE public.tours_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tours_reports FROM anon, authenticated;
GRANT SELECT ON public.tours_reports TO authenticated;
DROP POLICY IF EXISTS "Reporter and admins see reports" ON public.tours_reports;
CREATE POLICY "Reporter and admins see reports" ON public.tours_reports
  FOR SELECT TO authenticated USING (reporter_id = auth.uid() OR get_my_role() = 'admin');

/** Report a review, an account or a package. Returns the report id. */
CREATE OR REPLACE FUNCTION public.tours_submit_report(p_type text, p_target uuid, p_reason text, p_details text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me uuid := auth.uid();
  v_profile uuid;
  v_id uuid;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Please sign in.' USING ERRCODE = '42501'; END IF;
  IF p_reason NOT IN ('spam', 'abuse', 'fake', 'unsafe', 'scam', 'other') THEN
    RAISE EXCEPTION 'Choose a reason.' USING ERRCODE = '22023';
  END IF;
  IF p_reason = 'other' AND char_length(btrim(COALESCE(p_details, ''))) < 5 THEN
    RAISE EXCEPTION 'Tell us what is wrong.' USING ERRCODE = '22023';
  END IF;
  v_profile := CASE p_type
    WHEN 'review' THEN (SELECT tourist_id FROM tours_reviews WHERE id = p_target)
    WHEN 'package' THEN (SELECT o.profile_id FROM tours_packages p JOIN tours_operators o ON o.id = p.operator_id WHERE p.id = p_target)
    WHEN 'profile' THEN (SELECT id FROM profiles WHERE id = p_target)
  END;
  IF v_profile IS NULL THEN RAISE EXCEPTION 'That could not be found.' USING ERRCODE = '22023'; END IF;
  IF v_profile = v_me THEN RAISE EXCEPTION 'You cannot report yourself.' USING ERRCODE = '22023'; END IF;
  IF (SELECT count(*) FROM tours_reports WHERE reporter_id = v_me AND created_at > now() - interval '1 day') >= 10 THEN
    RAISE EXCEPTION 'You have sent many reports today. Try again tomorrow.' USING ERRCODE = '54000';
  END IF;

  SELECT id INTO v_id FROM tours_reports WHERE reporter_id = v_me AND target_type = p_type AND target_id = p_target AND status = 'open';
  IF FOUND THEN RETURN v_id; END IF;
  INSERT INTO tours_reports (reporter_id, target_type, target_id, target_profile_id, reason, details)
  VALUES (v_me, p_type, p_target, v_profile, p_reason, NULLIF(left(btrim(COALESCE(p_details, '')), 1000), ''))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

/** Admin closes a report as dismissed or actioned (the action itself is done separately). The reporter is told. */
CREATE OR REPLACE FUNCTION public.tours_admin_resolve_report(p_id uuid, p_status text, p_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r tours_reports;
BEGIN
  IF get_my_role() IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'Only admins can resolve reports.' USING ERRCODE = '42501'; END IF;
  IF p_status NOT IN ('actioned', 'dismissed') THEN RAISE EXCEPTION 'Choose dismissed or actioned.' USING ERRCODE = '22023'; END IF;
  UPDATE tours_reports
     SET status = p_status, resolution_note = NULLIF(left(btrim(COALESCE(p_note, '')), 500), ''), resolved_by = auth.uid(), resolved_at = now()
   WHERE id = p_id AND status = 'open'
  RETURNING * INTO r;
  IF NOT FOUND THEN RAISE EXCEPTION 'That report is already closed.' USING ERRCODE = '22023'; END IF;
  INSERT INTO tours_admin_audit_log (admin_id, action, entity_type, entity_id, new_value, notes)
  VALUES (auth.uid(), 'resolve_report', 'report', p_id, p_status, r.resolution_note);
  PERFORM tours_notify(r.reporter_id, 'report_resolved',
    CASE WHEN p_status = 'actioned' THEN 'We acted on your report' ELSE 'We reviewed your report' END,
    CASE WHEN p_status = 'actioned' THEN 'Thank you. The Tourism Office took action.' ELSE 'Thank you. We found nothing that breaks the rules.' END,
    NULL);
END;
$$;

/** Reports for the admin queue, with a short description of each target and how many open reports it has. */
CREATE OR REPLACE FUNCTION public.tours_admin_reports(p_status text DEFAULT 'open', p_limit int DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF get_my_role() IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'Admins only.' USING ERRCODE = '42501'; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(x ORDER BY (x->>'created_at') DESC) FROM (
      SELECT jsonb_build_object(
        'id', r.id, 'type', r.target_type, 'target_id', r.target_id, 'reason', r.reason, 'details', r.details,
        'status', r.status, 'note', r.resolution_note, 'created_at', r.created_at, 'resolved_at', r.resolved_at,
        'reporter', COALESCE(rp.full_name, 'Someone'),
        'target_profile_id', r.target_profile_id,
        'target_name', COALESCE(tp.full_name, '—'), 'target_role', tp.role, 'target_suspended', COALESCE(tp.is_suspended, false),
        'open_on_target', (SELECT count(*) FROM tours_reports o WHERE o.target_profile_id = r.target_profile_id AND o.status = 'open'),
        'summary', CASE r.target_type
          WHEN 'review' THEN (SELECT jsonb_build_object('rating', v.rating, 'comment', left(v.comment, 300), 'hidden', v.is_hidden,
                                                       'about', COALESCE(o.business_name, 'Operator'))
                                FROM tours_reviews v JOIN tours_operators o ON o.id = v.operator_id WHERE v.id = r.target_id)
          WHEN 'package' THEN (SELECT jsonb_build_object('title', p.title, 'status', p.status) FROM tours_packages p WHERE p.id = r.target_id)
          ELSE NULL END
      ) AS x
        FROM tours_reports r
        JOIN profiles rp ON rp.id = r.reporter_id
        LEFT JOIN profiles tp ON tp.id = r.target_profile_id
       WHERE p_status = 'all' OR r.status = p_status
       ORDER BY r.created_at DESC
       LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200)
    ) s
  ), '[]'::jsonb);
END;
$$;

-- 2. Timed bans --------------------------------------------------------------------

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS suspended_until timestamptz;

/**
 * Ban for p_days (NULL = until lifted). Records it like tours_admin_set_suspended;
 * the server action also bans sign-in in Supabase Auth for the same time.
 */
CREATE OR REPLACE FUNCTION public.tours_admin_ban(p_user_id uuid, p_days int, p_reason text)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_until timestamptz := CASE WHEN p_days IS NULL THEN NULL ELSE now() + make_interval(days => p_days) END;
BEGIN
  IF p_days IS NOT NULL AND (p_days < 1 OR p_days > 365) THEN
    RAISE EXCEPTION 'Choose 1 to 365 days, or until lifted.' USING ERRCODE = '22023';
  END IF;
  PERFORM tours_admin_set_suspended(p_user_id, true, p_reason);
  UPDATE profiles SET suspended_until = v_until WHERE id = p_user_id;
  RETURN v_until;
END;
$$;

/** Lifts bans whose time is up (Auth lifts its own). Cheap; the admin pages call it on load. */
CREATE OR REPLACE FUNCTION public.tours_admin_clear_expired_bans()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v int;
BEGIN
  IF get_my_role() IS DISTINCT FROM 'admin' THEN RETURN 0; END IF;
  UPDATE profiles SET is_suspended = false, suspended_at = NULL, suspended_reason = NULL, suspended_until = NULL
   WHERE is_suspended AND suspended_until IS NOT NULL AND suspended_until <= now();
  GET DIAGNOSTICS v = ROW_COUNT;
  RETURN v;
END;
$$;

-- Clearing a ban by hand also clears its end date.
CREATE OR REPLACE FUNCTION public.tours_profiles_clear_ban_until()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT NEW.is_suspended THEN NEW.suspended_until := NULL; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_profiles_clear_ban_until ON public.profiles;
CREATE TRIGGER trg_profiles_clear_ban_until BEFORE UPDATE OF is_suspended ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tours_profiles_clear_ban_until();

-- 3. Review watch -------------------------------------------------------------------

/** Operators and guides with low reviews (1-2 stars) in the last p_days, worst first. */
CREATE OR REPLACE FUNCTION public.tours_admin_review_watch(p_days int DEFAULT 90)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_since timestamptz := now() - make_interval(days => LEAST(GREATEST(COALESCE(p_days, 90), 7), 365));
BEGIN
  IF get_my_role() IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'Admins only.' USING ERRCODE = '42501'; END IF;
  RETURN jsonb_build_object(
    'operators', COALESCE((
      SELECT jsonb_agg(x ORDER BY (x->>'low')::int DESC, (x->>'average')::numeric NULLS LAST) FROM (
        SELECT jsonb_build_object(
          'id', o.id, 'profile_id', o.profile_id, 'name', o.business_name, 'suspended', COALESCE(pr.is_suspended, false),
          'reviews', count(v.*), 'average', round(avg(v.rating), 2),
          'low', count(*) FILTER (WHERE v.rating <= 2 AND v.created_at >= v_since),
          'hidden', count(*) FILTER (WHERE v.is_hidden),
          'open_reports', (SELECT count(*) FROM tours_reports r WHERE r.target_profile_id = o.profile_id AND r.status = 'open')
        ) AS x
          FROM tours_operators o
          LEFT JOIN profiles pr ON pr.id = o.profile_id
          JOIN tours_reviews v ON v.operator_id = o.id
         GROUP BY o.id, o.profile_id, o.business_name, pr.is_suspended
        HAVING count(*) FILTER (WHERE v.rating <= 2 AND v.created_at >= v_since) > 0
      ) s), '[]'::jsonb),
    'guides', COALESCE((
      SELECT jsonb_agg(x ORDER BY (x->>'low')::int DESC, (x->>'average')::numeric NULLS LAST) FROM (
        SELECT jsonb_build_object(
          'id', g.id, 'profile_id', g.profile_id, 'name', COALESCE(pr.full_name, 'Guide'), 'suspended', COALESCE(pr.is_suspended, false),
          'reviews', count(v.*), 'average', round(avg(v.rating), 2),
          'low', count(*) FILTER (WHERE v.rating <= 2 AND v.created_at >= v_since),
          'hidden', count(*) FILTER (WHERE v.is_hidden),
          'open_reports', (SELECT count(*) FROM tours_reports r WHERE r.target_profile_id = g.profile_id AND r.status = 'open')
        ) AS x
          FROM tours_guides g
          LEFT JOIN profiles pr ON pr.id = g.profile_id
          JOIN tours_reviews v ON v.guide_id = g.id
         GROUP BY g.id, g.profile_id, pr.full_name, pr.is_suspended
        HAVING count(*) FILTER (WHERE v.rating <= 2 AND v.created_at >= v_since) > 0
      ) s), '[]'::jsonb),
    'low_reviews', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', v.id, 'rating', v.rating, 'comment', left(v.comment, 400), 'hidden', v.is_hidden, 'created_at', v.created_at,
               'operator', o.business_name, 'guide', gp.full_name, 'package', p.title, 'reply', left(v.operator_reply, 300)
             ) ORDER BY v.created_at DESC)
        FROM (SELECT * FROM tours_reviews WHERE rating <= 2 AND created_at >= v_since ORDER BY created_at DESC LIMIT 50) v
        JOIN tours_operators o ON o.id = v.operator_id
        JOIN tours_packages p ON p.id = v.package_id
        LEFT JOIN tours_guides g ON g.id = v.guide_id
        LEFT JOIN profiles gp ON gp.id = g.profile_id
    ), '[]'::jsonb)
  );
END;
$$;

-- 4. Revenue ---------------------------------------------------------------------------

/** Everything the admin needs about money in a range (Manila days). Per-operator figures stay in tours_earnings. */
CREATE OR REPLACE FUNCTION public.tours_admin_revenue(p_from date, p_to date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_start timestamptz := p_from::timestamp AT TIME ZONE 'Asia/Manila';
  v_end timestamptz := (p_to + 1)::timestamp AT TIME ZONE 'Asia/Manila';
BEGIN
  IF get_my_role() IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'Admins only.' USING ERRCODE = '42501'; END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to - p_from > 366 THEN
    RAISE EXCEPTION 'Choose a date range of up to one year.' USING ERRCODE = '22023';
  END IF;
  RETURN (
    WITH b AS (
      SELECT b.id, b.status, b.total_amount, b.tour_date, b.package_id, b.number_of_pax
        FROM tours_bookings b WHERE b.tour_date BETWEEN p_from AND p_to
    ), pay AS (
      SELECT p.amount, p.payment_status, COALESCE(NULLIF(p.payment_method, ''), 'other') AS method,
             (p.payment_date AT TIME ZONE 'Asia/Manila')::date AS day
        FROM tours_payments p WHERE p.payment_date >= v_start AND p.payment_date < v_end
    )
    SELECT jsonb_build_object(
      'bookings', (SELECT count(*) FROM b),
      'guests', (SELECT COALESCE(sum(number_of_pax), 0) FROM b WHERE status IN ('confirmed', 'completed')),
      'booked', (SELECT COALESCE(sum(total_amount), 0) FROM b WHERE status IN ('confirmed', 'completed')),
      'average_booking', (SELECT COALESCE(round(avg(total_amount), 2), 0) FROM b WHERE status IN ('confirmed', 'completed')),
      'collected', (SELECT COALESCE(sum(amount), 0) FROM pay WHERE payment_status = 'completed'),
      'refunded', (SELECT COALESCE(sum(amount), 0) FROM pay WHERE payment_status = 'refunded'),
      'pending_payments', (SELECT COALESCE(sum(amount), 0) FROM pay WHERE payment_status = 'pending'),
      'statuses', COALESCE((SELECT jsonb_agg(jsonb_build_object('status', status, 'count', n, 'amount', a) ORDER BY n DESC)
                              FROM (SELECT status, count(*) n, COALESCE(sum(total_amount), 0) a FROM b GROUP BY status) s), '[]'::jsonb),
      'methods', COALESCE((SELECT jsonb_agg(jsonb_build_object('method', method, 'count', n, 'amount', a) ORDER BY a DESC)
                             FROM (SELECT method, count(*) n, sum(amount) a FROM pay WHERE payment_status = 'completed' GROUP BY method) s), '[]'::jsonb),
      'months', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('month', m, 'booked', COALESCE(bk, 0), 'collected', COALESCE(col, 0), 'refunded', COALESCE(ref, 0)) ORDER BY m)
          FROM (
            SELECT m, sum(bk) bk, sum(col) col, sum(ref) ref FROM (
              SELECT to_char(tour_date, 'YYYY-MM') m, total_amount bk, 0::numeric col, 0::numeric ref FROM b WHERE status IN ('confirmed', 'completed')
              UNION ALL SELECT to_char(day, 'YYYY-MM'), 0, amount, 0 FROM pay WHERE payment_status = 'completed'
              UNION ALL SELECT to_char(day, 'YYYY-MM'), 0, 0, amount FROM pay WHERE payment_status = 'refunded'
            ) u GROUP BY m
          ) s), '[]'::jsonb),
      'top_packages', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', id, 'title', title, 'operator', operator, 'bookings', n, 'booked', a) ORDER BY a DESC)
          FROM (
            SELECT p.id, p.title, o.business_name operator, count(*) n, sum(b.total_amount) a
              FROM b JOIN tours_packages p ON p.id = b.package_id JOIN tours_operators o ON o.id = p.operator_id
             WHERE b.status IN ('confirmed', 'completed')
             GROUP BY p.id, p.title, o.business_name ORDER BY sum(b.total_amount) DESC LIMIT 10
          ) s), '[]'::jsonb)
    )
  );
END;
$$;

-- 5. Activity log ------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.tours_activity_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid,
  actor_role text,
  action text NOT NULL CHECK (action IN ('insert', 'update', 'delete')),
  entity text NOT NULL,
  entity_id text,
  changes jsonb
);
CREATE INDEX IF NOT EXISTS idx_tours_activity_at ON public.tours_activity_log (at DESC);
CREATE INDEX IF NOT EXISTS idx_tours_activity_entity ON public.tours_activity_log (entity, at DESC);
CREATE INDEX IF NOT EXISTS idx_tours_activity_actor ON public.tours_activity_log (actor_id, at DESC);

ALTER TABLE public.tours_activity_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tours_activity_log FROM anon, authenticated;

/**
 * Records a write. Updates keep only the columns that changed (new values);
 * inserts and deletes keep the row. Secrets and bulky columns are left out,
 * and anything over 4 KB keeps just the column names.
 */
CREATE OR REPLACE FUNCTION public.tours_log_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_new jsonb := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END;
  v_old jsonb := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END;
  v_changes jsonb;
  v_skip text[] := ARRAY['updated_at', 'raw_event', 'bank_account_number', 'gcash_number', 'qr_code_value', 'photos', 'gallery_urls', 'preferences'];
  v_actor uuid := auth.uid();
BEGIN
  IF TG_OP = 'UPDATE' THEN
    SELECT jsonb_object_agg(k, v_new -> k) INTO v_changes
      FROM jsonb_object_keys(v_new) k
     WHERE NOT (k = ANY (v_skip)) AND (v_new -> k) IS DISTINCT FROM (v_old -> k);
    IF v_changes IS NULL THEN RETURN NULL; END IF;  -- nothing that matters changed
  ELSE
    v_changes := COALESCE(v_new, v_old) - v_skip;
  END IF;
  IF pg_column_size(v_changes) > 4096 THEN
    v_changes := jsonb_build_object('_columns', (SELECT jsonb_agg(k) FROM jsonb_object_keys(v_changes) k));
  END IF;
  INSERT INTO tours_activity_log (actor_id, actor_role, action, entity, entity_id, changes)
  VALUES (v_actor,
          CASE WHEN v_actor IS NULL THEN 'system' ELSE (SELECT role FROM profiles WHERE id = v_actor) END,
          lower(TG_OP), TG_TABLE_NAME,
          COALESCE(v_new ->> 'id', v_old ->> 'id', v_new ->> 'booking_id', v_old ->> 'booking_id', v_new ->> 'itinerary_id', v_old ->> 'itinerary_id'),
          v_changes);
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.tours_log_activity() FROM PUBLIC, anon, authenticated;

DO $do$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'profiles', 'tours_bookings', 'tours_payments', 'tours_booking_payments', 'tours_packages', 'tours_reviews',
    'tours_operators', 'tours_guides', 'tours_guide_applications', 'tours_guide_swap_requests', 'tours_package_guides',
    'tours_guide_availability', 'tours_itineraries', 'tours_itinerary_shares', 'tours_friendships', 'tours_reports',
    'tours_attractions', 'tours_events'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_activity ON public.%1$I', t);
      EXECUTE format('CREATE TRIGGER trg_%1$s_activity AFTER INSERT OR UPDATE OR DELETE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.tours_log_activity()', t);
    END IF;
  END LOOP;
END
$do$;

/**
 * The activity log, newest first, p_limit rows at a time (before p_before for
 * the next page). Filters: entity (table), actor role, one actor, and a range.
 * Admin audit entries are merged in as entity 'admin_action'.
 */
CREATE OR REPLACE FUNCTION public.tours_admin_activity(
  p_entity text DEFAULT NULL, p_role text DEFAULT NULL, p_actor uuid DEFAULT NULL,
  p_from date DEFAULT NULL, p_to date DEFAULT NULL, p_before timestamptz DEFAULT NULL, p_limit int DEFAULT 50
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_limit int := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_start timestamptz := CASE WHEN p_from IS NULL THEN '-infinity'::timestamptz ELSE p_from::timestamp AT TIME ZONE 'Asia/Manila' END;
  v_end timestamptz := CASE WHEN p_to IS NULL THEN 'infinity'::timestamptz ELSE (p_to + 1)::timestamp AT TIME ZONE 'Asia/Manila' END;
BEGIN
  IF get_my_role() IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'Admins only.' USING ERRCODE = '42501'; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(x)::jsonb ORDER BY x.at DESC) FROM (
      SELECT * FROM (
        SELECT l.id::text AS id, l.at, l.actor_id, COALESCE(l.actor_role, 'system') AS actor_role, pr.full_name AS actor_name,
               l.action, l.entity, l.entity_id, l.changes, NULL::text AS notes
          FROM tours_activity_log l LEFT JOIN profiles pr ON pr.id = l.actor_id
         WHERE l.at >= v_start AND l.at < v_end AND (p_before IS NULL OR l.at < p_before)
           AND (p_entity IS NULL OR p_entity = '' OR l.entity = p_entity)
           AND (p_role IS NULL OR p_role = '' OR COALESCE(l.actor_role, 'system') = p_role)
           AND (p_actor IS NULL OR l.actor_id = p_actor)
         ORDER BY l.at DESC LIMIT v_limit
      ) a
      UNION ALL
      SELECT * FROM (
        SELECT 'a' || au.id::text, COALESCE(au.created_at, now()), au.admin_id, 'admin', pr.full_name,
               au.action, 'admin_action', au.entity_type || ':' || au.entity_id::text,
               jsonb_strip_nulls(jsonb_build_object('old', au.old_value, 'new', au.new_value)), au.notes
          FROM tours_admin_audit_log au LEFT JOIN profiles pr ON pr.id = au.admin_id
         WHERE COALESCE(au.created_at, now()) >= v_start AND COALESCE(au.created_at, now()) < v_end
           AND (p_before IS NULL OR au.created_at < p_before)
           AND (p_entity IS NULL OR p_entity = '' OR p_entity = 'admin_action')
           AND (p_role IS NULL OR p_role = '' OR p_role = 'admin')
           AND (p_actor IS NULL OR au.admin_id = p_actor)
         ORDER BY au.created_at DESC LIMIT v_limit
      ) b
      ORDER BY 2 DESC
      LIMIT v_limit
    ) x
  ), '[]'::jsonb);
END;
$$;

-- 6. Guide picking without municipalities ------------------------------------------------

/**
 * The fair pick (20261209) for Daet only: any guide on the operator's team who
 * is free for the tour's hours; the package's own guides first, then fewest
 * recent tours, the operator's ranking, rating, and longest-standing.
 */
CREATE OR REPLACE FUNCTION public.tours_pick_guide(p_package_id uuid, p_date date, p_booking_id uuid, p_rejected uuid[])
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT g.id
    FROM tours_guides g
    JOIN tours_packages p ON p.id = p_package_id
    LEFT JOIN tours_package_guides pg ON pg.package_id = p.id AND pg.guide_id = g.id AND pg.is_active
    LEFT JOIN tours_guide_ratings r ON r.guide_id = g.id
   WHERE g.accreditation_status = 'approved'
     AND tours_guide_works_for(g.id, p.operator_id)
     AND NOT (g.id = ANY (COALESCE(p_rejected, '{}')))
     AND tours_guide_busy_reason_for(g.id, p_date, p_package_id, p_booking_id) IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM tours_bookings o
        WHERE o.proposed_guide_id = g.id AND o.tour_date = p_date
          AND o.guide_proposal_status = 'proposed' AND o.status IN ('pending', 'confirmed')
          AND (p_booking_id IS NULL OR o.id <> p_booking_id)
          AND tours_package_window(o.package_id) && tours_package_window(p_package_id)
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

-- Grants ------------------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.tours_submit_report(text, uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tours_admin_resolve_report(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tours_admin_reports(text, int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tours_admin_ban(uuid, int, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tours_admin_clear_expired_bans() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tours_admin_review_watch(int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tours_admin_revenue(date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tours_admin_activity(text, text, uuid, date, date, timestamptz, int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tours_profiles_clear_ban_until() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tours_submit_report(text, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tours_admin_resolve_report(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tours_admin_reports(text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tours_admin_ban(uuid, int, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tours_admin_clear_expired_bans() TO authenticated;
GRANT EXECUTE ON FUNCTION public.tours_admin_review_watch(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tours_admin_revenue(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tours_admin_activity(text, text, uuid, date, date, timestamptz, int) TO authenticated;
