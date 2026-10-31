-- Live tour tracking (Recommended option).
--
-- * The assigned guide shares their live location while a session runs
--   (from 30 minutes before the meeting time until the tour's end).
-- * The tourist opts in: "trip" shares only the nearest town on the way to
--   Daet (from 24 h before), "tour" shares the live spot during the session.
-- * Only the latest position is kept (no trail). Ending the session, or the
--   tour window closing, deletes positions and "I'm separated" flares.
-- * "I'm separated" sends one location to the guide and operator even
--   without sharing.
-- * Readers: the booking's tourist (own row + the guide), its guide, its
--   operator, admins. All writes go through the SECURITY DEFINER functions.
-- * Apps hear a private Realtime "changed" signal and re-read through RLS.

-- 1. Tables ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tours_live_sessions (
  booking_id uuid PRIMARY KEY REFERENCES public.tours_bookings(id) ON DELETE CASCADE,
  guide_id uuid NOT NULL REFERENCES public.tours_guides(id),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  -- Stops the guide has reached, from "Arrived at stop" (0 = none yet).
  stops_reached integer NOT NULL DEFAULT 0 CHECK (stops_reached >= 0)
);

CREATE TABLE IF NOT EXISTS public.tours_live_consents (
  booking_id uuid NOT NULL REFERENCES public.tours_bookings(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  share_trip boolean NOT NULL DEFAULT false,
  share_tour boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (booking_id, profile_id)
);

CREATE TABLE IF NOT EXISTS public.tours_live_positions (
  booking_id uuid NOT NULL REFERENCES public.tours_bookings(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('guide', 'tourist')),
  lat double precision NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng double precision NOT NULL CHECK (lng BETWEEN -180 AND 180),
  accuracy_m integer CHECK (accuracy_m >= 0),
  precision text NOT NULL CHECK (precision IN ('exact', 'town')),
  place_name text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (booking_id, profile_id)
);

CREATE TABLE IF NOT EXISTS public.tours_live_flares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.tours_bookings(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  lat double precision NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng double precision NOT NULL CHECK (lng BETWEEN -180 AND 180),
  accuracy_m integer CHECK (accuracy_m >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES public.profiles(id)
);
CREATE INDEX IF NOT EXISTS tours_live_flares_booking_idx ON public.tours_live_flares (booking_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tours_live_sessions_guide_idx ON public.tours_live_sessions (guide_id);
CREATE INDEX IF NOT EXISTS tours_live_consents_profile_idx ON public.tours_live_consents (profile_id);
CREATE INDEX IF NOT EXISTS tours_live_positions_profile_idx ON public.tours_live_positions (profile_id);
CREATE INDEX IF NOT EXISTS tours_live_flares_profile_idx ON public.tours_live_flares (profile_id);

ALTER TABLE public.tours_live_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tours_live_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tours_live_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tours_live_flares ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.tours_live_sessions, public.tours_live_consents, public.tours_live_positions, public.tours_live_flares FROM anon, authenticated;
GRANT SELECT ON public.tours_live_sessions, public.tours_live_consents, public.tours_live_positions, public.tours_live_flares TO authenticated;

-- 2. Read access ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tours_live_can_watch(p_booking_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT tours_is_booking_guide(p_booking_id) OR tours_is_booking_operator(p_booking_id) OR get_my_role() = 'admin';
$fn$;

DROP POLICY IF EXISTS tours_live_sessions_read ON public.tours_live_sessions;
CREATE POLICY tours_live_sessions_read ON public.tours_live_sessions FOR SELECT TO authenticated
  USING (tours_is_booking_tourist(booking_id) OR tours_live_can_watch(booking_id));

DROP POLICY IF EXISTS tours_live_consents_read ON public.tours_live_consents;
CREATE POLICY tours_live_consents_read ON public.tours_live_consents FOR SELECT TO authenticated
  USING (profile_id = (SELECT auth.uid()) OR tours_live_can_watch(booking_id));

-- A tourist sees their own position and the guide's, never anyone else's.
DROP POLICY IF EXISTS tours_live_positions_read ON public.tours_live_positions;
CREATE POLICY tours_live_positions_read ON public.tours_live_positions FOR SELECT TO authenticated
  USING (
    profile_id = (SELECT auth.uid())
    OR (role = 'guide' AND tours_is_booking_tourist(booking_id))
    OR tours_live_can_watch(booking_id)
  );

DROP POLICY IF EXISTS tours_live_flares_read ON public.tours_live_flares;
CREATE POLICY tours_live_flares_read ON public.tours_live_flares FOR SELECT TO authenticated
  USING (profile_id = (SELECT auth.uid()) OR tours_live_can_watch(booking_id));

-- 3. Helpers -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tours_live_distance_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
RETURNS double precision LANGUAGE sql IMMUTABLE SET search_path = public AS $fn$
  SELECT 2 * 6371008.8 * asin(least(1, sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  )));
$fn$;

/**
 * When live sharing is open for a booking (Asia/Manila):
 *   opens      30 min before the meeting time (06:00 when the tour has none)
 *   closes     hours tours: start + duration + 3 h; day tours: end of the last day
 *   trip_opens 24 h before opens (town-level trip sharing)
 */
CREATE OR REPLACE FUNCTION public.tours_live_window(p_booking_id uuid, OUT opens timestamptz, OUT closes timestamptz, OUT trip_opens timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT
    w.start - interval '30 minutes',
    CASE WHEN p.duration_type::text = 'hours'
      THEN w.start + make_interval(hours => greatest(coalesce(p.duration_value, 1), 1) + 3)
      ELSE ((b.tour_date + greatest(coalesce(p.duration_value, 1), 1))::timestamp AT TIME ZONE 'Asia/Manila')
    END,
    w.start - interval '30 minutes' - interval '24 hours'
  FROM tours_bookings b
  JOIN tours_packages p ON p.id = b.package_id
  CROSS JOIN LATERAL (SELECT ((b.tour_date + coalesce(p.meeting_time, time '06:00'))::timestamp AT TIME ZONE 'Asia/Manila') AS start) w
  WHERE b.id = p_booking_id;
$fn$;

/** Nearest town on the usual routes to Daet; the point is snapped to that town (or a 0.1° grid if none is near). */
CREATE OR REPLACE FUNCTION public.tours_live_snap_town(p_lat double precision, p_lng double precision, OUT lat double precision, OUT lng double precision, OUT place_name text)
LANGUAGE sql IMMUTABLE SET search_path = public AS $fn$
  WITH towns(name, tlat, tlng) AS (VALUES
    ('Manila', 14.5995, 120.9842), ('Calamba', 14.2117, 121.1653), ('San Pablo', 14.0683, 121.3256),
    ('Lucena', 13.9373, 121.6170), ('Atimonan', 14.0019, 121.9200), ('Gumaca', 13.9210, 122.1002),
    ('Lopez', 13.8840, 122.2600), ('Calauag', 13.9576, 122.2881), ('Santa Elena', 14.1801, 122.3925),
    ('Labo', 14.1563, 122.8302), ('Daet', 14.1122, 122.9553), ('Sipocot', 13.7680, 122.9780), ('Naga', 13.6218, 123.1948)
  ), nearest AS (
    SELECT name, tlat, tlng, tours_live_distance_m(p_lat, p_lng, tlat, tlng) AS d FROM towns ORDER BY d LIMIT 1
  )
  SELECT
    CASE WHEN d <= 30000 THEN tlat ELSE round(p_lat::numeric, 1)::double precision END,
    CASE WHEN d <= 30000 THEN tlng ELSE round(p_lng::numeric, 1)::double precision END,
    CASE WHEN d <= 30000 THEN name ELSE NULL END
  FROM nearest;
$fn$;

/** Ends a session whose window has closed and deletes its locations. Returns true when the booking is still live. */
CREATE OR REPLACE FUNCTION public.tours_live_expire(p_booking_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  w record;
BEGIN
  SELECT * INTO w FROM tours_live_window(p_booking_id);
  IF w.closes IS NULL OR now() >= w.closes THEN
    UPDATE tours_live_sessions SET ended_at = coalesce(ended_at, now()) WHERE booking_id = p_booking_id;
    DELETE FROM tours_live_positions WHERE booking_id = p_booking_id;
    DELETE FROM tours_live_flares WHERE booking_id = p_booking_id;
    RETURN false;
  END IF;
  RETURN true;
END;
$fn$;

-- Old sessions are swept whenever anyone starts or pings, so nothing outlives a day.
CREATE OR REPLACE FUNCTION public.tours_live_sweep()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $fn$
  DELETE FROM tours_live_positions WHERE updated_at < now() - interval '24 hours';
  DELETE FROM tours_live_flares WHERE created_at < now() - interval '24 hours';
  UPDATE tours_live_sessions SET ended_at = now() WHERE ended_at IS NULL AND started_at < now() - interval '3 days';
$fn$;

CREATE OR REPLACE FUNCTION public.tours_live_session_active(p_booking_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT EXISTS (SELECT 1 FROM tours_live_sessions WHERE booking_id = p_booking_id AND ended_at IS NULL);
$fn$;

-- 4. Guide: start, progress, end ---------------------------------------------
CREATE OR REPLACE FUNCTION public.tours_live_start(p_booking_id uuid)
RETURNS public.tours_live_sessions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  b tours_bookings%ROWTYPE;
  v_guide uuid;
  w record;
  s tours_live_sessions;
BEGIN
  SELECT * INTO b FROM tours_bookings WHERE id = p_booking_id;
  SELECT g.id INTO v_guide FROM tours_guides g
   WHERE g.id = b.assigned_guide_id AND g.profile_id = auth.uid() AND g.accreditation_status = 'approved';
  IF b.id IS NULL OR v_guide IS NULL THEN
    RAISE EXCEPTION 'Only the guide assigned to this tour can start live sharing.' USING ERRCODE = '42501';
  END IF;
  IF b.status <> 'confirmed' THEN
    RAISE EXCEPTION 'Live sharing is only for confirmed bookings.' USING ERRCODE = '22023';
  END IF;
  PERFORM tours_live_sweep();
  SELECT * INTO w FROM tours_live_window(p_booking_id);
  IF now() < w.opens THEN
    RAISE EXCEPTION 'Live sharing opens at % (30 minutes before the meeting time).', to_char(w.opens AT TIME ZONE 'Asia/Manila', 'Mon DD, HH24:MI') USING ERRCODE = '22023';
  END IF;
  IF now() >= w.closes THEN
    RAISE EXCEPTION 'This tour has ended.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO tours_live_sessions (booking_id, guide_id) VALUES (p_booking_id, v_guide)
  ON CONFLICT (booking_id) DO UPDATE SET ended_at = NULL, guide_id = EXCLUDED.guide_id
  RETURNING * INTO s;
  -- Trip-level positions end when the tour starts.
  DELETE FROM tours_live_positions WHERE booking_id = p_booking_id AND precision = 'town';
  PERFORM tours_notify(b.user_id, 'live_started', 'Your guide is live', 'See where your guide is and share your location if you want.', '/tours/bookings/' || b.id);
  RETURN s;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.tours_live_reach_stop(p_booking_id uuid, p_stops_reached integer)
RETURNS public.tours_live_sessions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  s tours_live_sessions;
BEGIN
  IF NOT tours_is_booking_guide(p_booking_id) THEN
    RAISE EXCEPTION 'Only the assigned guide can update stops.' USING ERRCODE = '42501';
  END IF;
  UPDATE tours_live_sessions SET stops_reached = greatest(0, p_stops_reached)
   WHERE booking_id = p_booking_id AND ended_at IS NULL
  RETURNING * INTO s;
  IF s.booking_id IS NULL THEN
    RAISE EXCEPTION 'Start the live tour first.' USING ERRCODE = '22023';
  END IF;
  RETURN s;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.tours_live_end(p_booking_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT tours_live_can_watch(p_booking_id) THEN
    RAISE EXCEPTION 'Only the guide, the operator or an admin can end live sharing.' USING ERRCODE = '42501';
  END IF;
  UPDATE tours_live_sessions SET ended_at = coalesce(ended_at, now()) WHERE booking_id = p_booking_id;
  DELETE FROM tours_live_positions WHERE booking_id = p_booking_id;
  DELETE FROM tours_live_flares WHERE booking_id = p_booking_id;
END;
$fn$;

-- 5. Tourist: consent ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tours_live_set_consent(p_booking_id uuid, p_share_trip boolean, p_share_tour boolean)
RETURNS public.tours_live_consents LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  c tours_live_consents;
BEGIN
  IF NOT tours_is_booking_tourist(p_booking_id) THEN
    RAISE EXCEPTION 'Only the traveller on this booking can choose what to share.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM tours_bookings WHERE id = p_booking_id AND status = 'confirmed') THEN
    RAISE EXCEPTION 'Sharing is only for confirmed bookings.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO tours_live_consents (booking_id, profile_id, share_trip, share_tour, updated_at)
  VALUES (p_booking_id, auth.uid(), coalesce(p_share_trip, false), coalesce(p_share_tour, false), now())
  ON CONFLICT (booking_id, profile_id) DO UPDATE
    SET share_trip = EXCLUDED.share_trip, share_tour = EXCLUDED.share_tour, updated_at = now()
  RETURNING * INTO c;
  -- Stopping deletes what was shared.
  DELETE FROM tours_live_positions p
   WHERE p.booking_id = p_booking_id AND p.profile_id = auth.uid()
     AND ((p.precision = 'town' AND NOT c.share_trip) OR (p.precision = 'exact' AND NOT c.share_tour));
  RETURN c;
END;
$fn$;

-- 6. Ping ------------------------------------------------------------------------
/**
 * Stores the caller's latest position. Returns {stored, reason, precision, place_name}.
 * reason: 'ok' | 'throttled' | 'not_live' | 'no_consent' | 'closed'.
 */
CREATE OR REPLACE FUNCTION public.tours_live_ping(p_booking_id uuid, p_lat double precision, p_lng double precision, p_accuracy_m integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_live boolean;
  v_last timestamptz;
  c tours_live_consents;
  w record;
  snap record;
  v_lat double precision := p_lat;
  v_lng double precision := p_lng;
  v_precision text := 'exact';
  v_place text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in to share your location.' USING ERRCODE = '42501';
  END IF;
  IF p_lat IS NULL OR p_lng IS NULL OR abs(p_lat) > 90 OR abs(p_lng) > 180 THEN
    RAISE EXCEPTION 'That location is not valid.' USING ERRCODE = '22023';
  END IF;

  IF tours_is_booking_guide(p_booking_id) THEN
    v_role := 'guide';
  ELSIF tours_is_booking_tourist(p_booking_id) THEN
    v_role := 'tourist';
  ELSE
    RAISE EXCEPTION 'You are not on this tour.' USING ERRCODE = '42501';
  END IF;

  IF NOT tours_live_expire(p_booking_id) THEN
    RETURN jsonb_build_object('stored', false, 'reason', 'closed');
  END IF;

  SELECT updated_at INTO v_last FROM tours_live_positions WHERE booking_id = p_booking_id AND profile_id = v_uid;
  IF v_last IS NOT NULL AND v_last > now() - interval '10 seconds' THEN
    RETURN jsonb_build_object('stored', false, 'reason', 'throttled');
  END IF;

  v_live := tours_live_session_active(p_booking_id);
  IF v_role = 'guide' THEN
    IF NOT v_live THEN
      RETURN jsonb_build_object('stored', false, 'reason', 'not_live');
    END IF;
  ELSE
    SELECT * INTO c FROM tours_live_consents WHERE booking_id = p_booking_id AND profile_id = v_uid;
    IF v_live AND coalesce(c.share_tour, false) THEN
      v_precision := 'exact';
    ELSIF NOT v_live AND coalesce(c.share_trip, false) THEN
      SELECT * INTO w FROM tours_live_window(p_booking_id);
      IF now() < w.trip_opens THEN
        RETURN jsonb_build_object('stored', false, 'reason', 'closed');
      END IF;
      SELECT * INTO snap FROM tours_live_snap_town(p_lat, p_lng);
      v_lat := snap.lat;
      v_lng := snap.lng;
      v_place := snap.place_name;
      v_precision := 'town';
    ELSE
      RETURN jsonb_build_object('stored', false, 'reason', 'no_consent');
    END IF;
  END IF;

  INSERT INTO tours_live_positions (booking_id, profile_id, role, lat, lng, accuracy_m, precision, place_name, updated_at)
  VALUES (p_booking_id, v_uid, v_role, v_lat, v_lng, CASE WHEN v_precision = 'town' THEN NULL ELSE least(greatest(p_accuracy_m, 0), 100000) END, v_precision, v_place, now())
  ON CONFLICT (booking_id, profile_id) DO UPDATE
    SET lat = EXCLUDED.lat, lng = EXCLUDED.lng, accuracy_m = EXCLUDED.accuracy_m, precision = EXCLUDED.precision,
        place_name = EXCLUDED.place_name, role = EXCLUDED.role, updated_at = now();
  RETURN jsonb_build_object('stored', true, 'reason', 'ok', 'precision', v_precision, 'place_name', v_place);
END;
$fn$;

-- 7. "I'm separated" --------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tours_live_flare(p_booking_id uuid, p_lat double precision, p_lng double precision, p_accuracy_m integer DEFAULT NULL)
RETURNS public.tours_live_flares LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  b record;
  w record;
  f tours_live_flares;
BEGIN
  IF NOT tours_is_booking_tourist(p_booking_id) THEN
    RAISE EXCEPTION 'Only the traveller on this booking can send this.' USING ERRCODE = '42501';
  END IF;
  IF p_lat IS NULL OR p_lng IS NULL OR abs(p_lat) > 90 OR abs(p_lng) > 180 THEN
    RAISE EXCEPTION 'That location is not valid.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO w FROM tours_live_window(p_booking_id);
  IF now() < w.opens OR now() >= w.closes THEN
    RAISE EXCEPTION 'You can send this during your tour only. Call your guide or operator instead.' USING ERRCODE = '22023';
  END IF;
  -- One open alert at a time; a repeat within 2 minutes returns the same one.
  SELECT * INTO f FROM tours_live_flares
   WHERE booking_id = p_booking_id AND profile_id = auth.uid() AND resolved_at IS NULL AND created_at > now() - interval '2 minutes'
   ORDER BY created_at DESC LIMIT 1;
  IF f.id IS NOT NULL THEN
    RETURN f;
  END IF;

  INSERT INTO tours_live_flares (booking_id, profile_id, lat, lng, accuracy_m)
  VALUES (p_booking_id, auth.uid(), p_lat, p_lng, least(greatest(p_accuracy_m, 0), 100000))
  RETURNING * INTO f;

  SELECT bk.booking_reference, bk.contact_name, g.profile_id AS guide_profile, o.profile_id AS operator_profile
    INTO b
    FROM tours_bookings bk
    JOIN tours_packages p ON p.id = bk.package_id
    JOIN tours_operators o ON o.id = p.operator_id
    LEFT JOIN tours_guides g ON g.id = bk.assigned_guide_id
   WHERE bk.id = p_booking_id;
  PERFORM tours_notify(b.guide_profile, 'live_separated', coalesce(b.contact_name, 'A guest') || ' is separated from the group', 'Their location was sent once. Open the live map or call them.', '/tours/guide/tours/' || p_booking_id || '/live');
  PERFORM tours_notify(b.operator_profile, 'live_separated', coalesce(b.contact_name, 'A guest') || ' is separated from the group', 'Booking ' || b.booking_reference || '. Their location was sent once.', '/tours/operator/live/' || p_booking_id);
  RETURN f;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.tours_live_resolve_flare(p_flare_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_booking uuid;
BEGIN
  SELECT booking_id INTO v_booking FROM tours_live_flares WHERE id = p_flare_id;
  IF v_booking IS NULL OR NOT (tours_live_can_watch(v_booking) OR EXISTS (SELECT 1 FROM tours_live_flares WHERE id = p_flare_id AND profile_id = auth.uid())) THEN
    RAISE EXCEPTION 'You cannot close this alert.' USING ERRCODE = '42501';
  END IF;
  UPDATE tours_live_flares SET resolved_at = now(), resolved_by = auth.uid() WHERE id = p_flare_id AND resolved_at IS NULL;
END;
$fn$;

-- 8. Grants ------------------------------------------------------------------------
REVOKE ALL ON FUNCTION
  public.tours_live_can_watch(uuid), public.tours_live_window(uuid), public.tours_live_expire(uuid), public.tours_live_sweep(),
  public.tours_live_session_active(uuid), public.tours_live_start(uuid), public.tours_live_reach_stop(uuid, integer), public.tours_live_end(uuid),
  public.tours_live_set_consent(uuid, boolean, boolean), public.tours_live_ping(uuid, double precision, double precision, integer),
  public.tours_live_flare(uuid, double precision, double precision, integer), public.tours_live_resolve_flare(uuid),
  public.tours_live_snap_town(double precision, double precision), public.tours_live_distance_m(double precision, double precision, double precision, double precision)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.tours_live_can_watch(uuid), public.tours_live_window(uuid), public.tours_live_start(uuid), public.tours_live_reach_stop(uuid, integer),
  public.tours_live_end(uuid), public.tours_live_set_consent(uuid, boolean, boolean), public.tours_live_ping(uuid, double precision, double precision, integer),
  public.tours_live_flare(uuid, double precision, double precision, integer), public.tours_live_resolve_flare(uuid)
TO authenticated;

-- 9. Realtime: a private "changed" signal per booking ---------------------------
-- Tables are not added to the postgres_changes publication (its DELETE events
-- reach every subscriber). Instead a trigger sends a private broadcast with no
-- coordinates on topic tour-live:<booking id>; apps then re-read the rows
-- through the read policies above. Clients can listen but not send.
CREATE OR REPLACE FUNCTION public.tours_realtime_live_allowed(p_topic text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT p_topic ~ '^tour-live:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     AND (tours_is_booking_tourist(substring(p_topic FROM 11)::uuid) OR tours_live_can_watch(substring(p_topic FROM 11)::uuid));
$fn$;
REVOKE ALL ON FUNCTION public.tours_realtime_live_allowed(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tours_realtime_live_allowed(text) TO authenticated;

DROP POLICY IF EXISTS tours_live_channel_read ON realtime.messages;
CREATE POLICY tours_live_channel_read ON realtime.messages FOR SELECT TO authenticated
  USING (extension = 'broadcast' AND public.tours_realtime_live_allowed(realtime.topic()));

CREATE OR REPLACE FUNCTION public.tours_live_signal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_booking uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.booking_id ELSE NEW.booking_id END;
BEGIN
  PERFORM realtime.send(jsonb_build_object('table', TG_TABLE_NAME, 'op', TG_OP), 'changed', 'tour-live:' || v_booking, true);
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- A failed signal must never block the write; apps also refresh on a timer.
  RETURN NULL;
END;
$fn$;
REVOKE ALL ON FUNCTION public.tours_live_signal() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tours_live_sessions_signal ON public.tours_live_sessions;
CREATE TRIGGER tours_live_sessions_signal AFTER INSERT OR UPDATE OR DELETE ON public.tours_live_sessions FOR EACH ROW EXECUTE FUNCTION public.tours_live_signal();
DROP TRIGGER IF EXISTS tours_live_positions_signal ON public.tours_live_positions;
CREATE TRIGGER tours_live_positions_signal AFTER INSERT OR UPDATE OR DELETE ON public.tours_live_positions FOR EACH ROW EXECUTE FUNCTION public.tours_live_signal();
DROP TRIGGER IF EXISTS tours_live_flares_signal ON public.tours_live_flares;
CREATE TRIGGER tours_live_flares_signal AFTER INSERT OR UPDATE OR DELETE ON public.tours_live_flares FOR EACH ROW EXECUTE FUNCTION public.tours_live_signal();
DROP TRIGGER IF EXISTS tours_live_consents_signal ON public.tours_live_consents;
CREATE TRIGGER tours_live_consents_signal AFTER INSERT OR UPDATE OR DELETE ON public.tours_live_consents FOR EACH ROW EXECUTE FUNCTION public.tours_live_signal();
