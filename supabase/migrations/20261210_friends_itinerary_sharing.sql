-- Tourists add friends and share itinerary plans with them.
--
-- 1. tours_friendships: one row per pair (requester -> addressee), pending
--    until the addressee accepts. Either side can remove it.
-- 2. tours_itinerary_shares: an owner shares a saved plan with chosen friends,
--    read-only. Removing a friend removes what you shared with each other.
-- 3. RPCs only (no direct writes): find people (exact email, or name), send /
--    answer / cancel / remove, my friends, share a plan, plans shared with me,
--    and a friend's plan. Requests and shares notify through tours_notify.
--
-- Nothing here polls: pages read once per visit and server actions refresh.

-- 1. Friendships --------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.tours_friendships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  addressee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  CHECK (requester_id <> addressee_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tours_friendships_pair
  ON public.tours_friendships (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id));
CREATE INDEX IF NOT EXISTS idx_tours_friendships_addressee ON public.tours_friendships (addressee_id, status);
CREATE INDEX IF NOT EXISTS idx_tours_friendships_requester ON public.tours_friendships (requester_id, status);

ALTER TABLE public.tours_friendships ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tours_friendships FROM anon, authenticated;
GRANT SELECT ON public.tours_friendships TO authenticated;
DROP POLICY IF EXISTS "Friends see their own friendships" ON public.tours_friendships;
CREATE POLICY "Friends see their own friendships" ON public.tours_friendships
  FOR SELECT TO authenticated USING (auth.uid() IN (requester_id, addressee_id));

/** Are these two people friends (accepted)? */
CREATE OR REPLACE FUNCTION public.tours_are_friends(p_a uuid, p_b uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM tours_friendships f
     WHERE f.status = 'accepted'
       AND LEAST(f.requester_id, f.addressee_id) = LEAST(p_a, p_b)
       AND GREATEST(f.requester_id, f.addressee_id) = GREATEST(p_a, p_b)
  );
$$;
REVOKE ALL ON FUNCTION public.tours_are_friends(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- 2. Shares --------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.tours_itinerary_shares (
  itinerary_id uuid NOT NULL REFERENCES public.tours_itineraries(id) ON DELETE CASCADE,
  friend_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (itinerary_id, friend_id)
);
CREATE INDEX IF NOT EXISTS idx_tours_itinerary_shares_friend ON public.tours_itinerary_shares (friend_id);

ALTER TABLE public.tours_itinerary_shares ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tours_itinerary_shares FROM anon, authenticated;
GRANT SELECT ON public.tours_itinerary_shares TO authenticated;
DROP POLICY IF EXISTS "Owner and friend see a share" ON public.tours_itinerary_shares;
CREATE POLICY "Owner and friend see a share" ON public.tours_itinerary_shares
  FOR SELECT TO authenticated USING (
    friend_id = auth.uid()
    OR EXISTS (SELECT 1 FROM tours_itineraries i WHERE i.id = itinerary_id AND i.tourist_id = auth.uid())
  );

-- 3. RPCs -------------------------------------------------------------------------

/** The signed-in person, or an error. */
CREATE OR REPLACE FUNCTION public.tours_require_user()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Please sign in.' USING ERRCODE = '42501';
  END IF;
  RETURN auth.uid();
END;
$$;
REVOKE ALL ON FUNCTION public.tours_require_user() FROM PUBLIC, anon, authenticated;

/**
 * Up to 10 tourists matching an exact email address, or a name (3+ letters).
 * Never returns an email. Each row says where you stand with them.
 */
CREATE OR REPLACE FUNCTION public.tours_find_people(p_query text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me uuid := tours_require_user();
  v_q text := btrim(COALESCE(p_query, ''));
BEGIN
  IF char_length(v_q) < 3 OR char_length(v_q) > 120 THEN
    RETURN '[]'::jsonb;
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id', x.id, 'name', x.full_name, 'avatar_url', x.avatar_url, 'status', x.status) ORDER BY x.full_name)
      FROM (
        SELECT p.id, COALESCE(p.full_name, 'Traveller') AS full_name, p.avatar_url,
               CASE
                 WHEN f.status = 'accepted' THEN 'friends'
                 WHEN f.requester_id = v_me THEN 'requested'
                 WHEN f.addressee_id = v_me THEN 'incoming'
                 ELSE 'none'
               END AS status
          FROM profiles p
          LEFT JOIN tours_friendships f
            ON LEAST(f.requester_id, f.addressee_id) = LEAST(p.id, v_me)
           AND GREATEST(f.requester_id, f.addressee_id) = GREATEST(p.id, v_me)
         WHERE p.id <> v_me AND p.role = 'tourist'
           AND (
             (position('@' IN v_q) > 0 AND p.id IN (SELECT u.id FROM auth.users u WHERE lower(u.email) = lower(v_q)))
             OR (position('@' IN v_q) = 0 AND p.full_name ILIKE '%' || replace(replace(v_q, '%', ''), '_', '') || '%')
           )
         LIMIT 10
      ) x
  ), '[]'::jsonb);
END;
$$;

/** Ask someone to be friends. If they already asked you, this accepts. */
CREATE OR REPLACE FUNCTION public.tours_send_friend_request(p_profile uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me uuid := tours_require_user();
  f tours_friendships;
  v_name text;
BEGIN
  IF p_profile IS NULL OR p_profile = v_me THEN
    RAISE EXCEPTION 'Choose someone else.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_profile AND role = 'tourist') THEN
    RAISE EXCEPTION 'That traveller could not be found.' USING ERRCODE = '22023';
  END IF;
  SELECT COALESCE(full_name, 'A traveller') INTO v_name FROM profiles WHERE id = v_me;

  SELECT * INTO f FROM tours_friendships
   WHERE LEAST(requester_id, addressee_id) = LEAST(p_profile, v_me)
     AND GREATEST(requester_id, addressee_id) = GREATEST(p_profile, v_me)
   FOR UPDATE;
  IF FOUND THEN
    IF f.status = 'accepted' THEN RETURN 'friends'; END IF;
    IF f.requester_id = v_me THEN RETURN 'requested'; END IF;
    UPDATE tours_friendships SET status = 'accepted', responded_at = now() WHERE id = f.id;
    PERFORM tours_notify(p_profile, 'friend_accepted', v_name || ' accepted your friend request', 'You can now share trip plans with each other.', '/tours/friends');
    RETURN 'friends';
  END IF;

  IF (SELECT count(*) FROM tours_friendships WHERE requester_id = v_me AND status = 'pending') >= 50 THEN
    RAISE EXCEPTION 'You have many requests waiting. Wait for some answers first.' USING ERRCODE = '54000';
  END IF;
  INSERT INTO tours_friendships (requester_id, addressee_id) VALUES (v_me, p_profile);
  PERFORM tours_notify(p_profile, 'friend_request', v_name || ' wants to be friends', 'Accept to share trip plans with each other.', '/tours/friends');
  RETURN 'requested';
END;
$$;

/** Accept or decline a request sent to you. */
CREATE OR REPLACE FUNCTION public.tours_respond_friend_request(p_profile uuid, p_accept boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me uuid := tours_require_user();
  v_name text;
BEGIN
  IF p_accept THEN
    UPDATE tours_friendships SET status = 'accepted', responded_at = now()
     WHERE requester_id = p_profile AND addressee_id = v_me AND status = 'pending';
    IF FOUND THEN
      SELECT COALESCE(full_name, 'A traveller') INTO v_name FROM profiles WHERE id = v_me;
      PERFORM tours_notify(p_profile, 'friend_accepted', v_name || ' accepted your friend request', 'You can now share trip plans with each other.', '/tours/friends');
    END IF;
  ELSE
    DELETE FROM tours_friendships WHERE requester_id = p_profile AND addressee_id = v_me AND status = 'pending';
  END IF;
END;
$$;

/** Cancel your request, or unfriend. Plans you shared with each other stop being shared. */
CREATE OR REPLACE FUNCTION public.tours_remove_friend(p_profile uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me uuid := tours_require_user();
BEGIN
  DELETE FROM tours_friendships
   WHERE LEAST(requester_id, addressee_id) = LEAST(p_profile, v_me)
     AND GREATEST(requester_id, addressee_id) = GREATEST(p_profile, v_me);
  DELETE FROM tours_itinerary_shares s USING tours_itineraries i
   WHERE i.id = s.itinerary_id
     AND ((i.tourist_id = v_me AND s.friend_id = p_profile) OR (i.tourist_id = p_profile AND s.friend_id = v_me));
END;
$$;

/** Friends, requests to you, and requests you sent. */
CREATE OR REPLACE FUNCTION public.tours_my_friends()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH me AS (SELECT tours_require_user() AS id),
  rows AS (
    SELECT f.status, f.created_at, f.responded_at,
           CASE WHEN f.requester_id = me.id THEN f.addressee_id ELSE f.requester_id END AS other,
           f.requester_id = me.id AS sent
      FROM tours_friendships f, me
     WHERE me.id IN (f.requester_id, f.addressee_id)
  ),
  named AS (
    SELECT r.*, COALESCE(p.full_name, 'Traveller') AS name, p.avatar_url FROM rows r JOIN profiles p ON p.id = r.other
  )
  SELECT jsonb_build_object(
    'friends', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', other, 'name', name, 'avatar_url', avatar_url, 'since', responded_at) ORDER BY name) FROM named WHERE status = 'accepted'), '[]'::jsonb),
    'incoming', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', other, 'name', name, 'avatar_url', avatar_url, 'at', created_at) ORDER BY created_at DESC) FROM named WHERE status = 'pending' AND NOT sent), '[]'::jsonb),
    'outgoing', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', other, 'name', name, 'avatar_url', avatar_url, 'at', created_at) ORDER BY created_at DESC) FROM named WHERE status = 'pending' AND sent), '[]'::jsonb)
  );
$$;

/**
 * Sets exactly who a plan is shared with (friends only). Newly added friends
 * are notified. Returns the number of friends it is shared with.
 */
CREATE OR REPLACE FUNCTION public.tours_share_itinerary_with(p_itinerary uuid, p_friend_ids uuid[])
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me uuid := tours_require_user();
  v_ids uuid[] := ARRAY(SELECT DISTINCT unnest(COALESCE(p_friend_ids, '{}')));
  v_title text;
  v_name text;
  v_new uuid;
BEGIN
  SELECT title INTO v_title FROM tours_itineraries WHERE id = p_itinerary AND tourist_id = v_me;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only the plan''s owner can share it.' USING ERRCODE = '42501';
  END IF;
  IF cardinality(v_ids) > 200 THEN
    RAISE EXCEPTION 'Choose up to 200 friends.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_ids) x WHERE NOT tours_are_friends(v_me, x)) THEN
    RAISE EXCEPTION 'You can only share with your friends.' USING ERRCODE = '22023';
  END IF;

  DELETE FROM tours_itinerary_shares WHERE itinerary_id = p_itinerary AND NOT (friend_id = ANY (v_ids));
  SELECT COALESCE(full_name, 'A friend') INTO v_name FROM profiles WHERE id = v_me;
  FOR v_new IN
    INSERT INTO tours_itinerary_shares (itinerary_id, friend_id)
    SELECT p_itinerary, x FROM unnest(v_ids) x
    ON CONFLICT DO NOTHING
    RETURNING friend_id
  LOOP
    PERFORM tours_notify(v_new, 'itinerary_shared', v_name || ' shared a trip plan with you', COALESCE(v_title, 'Trip plan'), '/tours/friends/plans/' || p_itinerary);
  END LOOP;
  RETURN cardinality(v_ids);
END;
$$;

/** Plans your friends shared with you, newest first. */
CREATE OR REPLACE FUNCTION public.tours_itineraries_shared_with_me()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', i.id, 'title', i.title, 'start_date', i.start_date, 'end_date', i.end_date,
           'owner', COALESCE(p.full_name, 'A friend'), 'shared_at', s.created_at
         ) ORDER BY s.created_at DESC), '[]'::jsonb)
    FROM tours_itinerary_shares s
    JOIN tours_itineraries i ON i.id = s.itinerary_id
    JOIN profiles p ON p.id = i.tourist_id
   WHERE s.friend_id = tours_require_user()
     AND tours_are_friends(s.friend_id, i.tourist_id);
$$;

/** A plan a friend shared with you (same shape as tours_shared_itinerary, plus the owner's name). Null otherwise. */
CREATE OR REPLACE FUNCTION public.tours_friend_itinerary(p_itinerary uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'title', i.title, 'start_date', i.start_date, 'end_date', i.end_date, 'summary', i.summary,
    'owner', COALESCE(p.full_name, 'A friend'),
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'day_number', it.day_number, 'item_order', it.item_order, 'kind', it.item_kind,
        'location_name', it.location_name, 'description', it.description, 'tip', it.tip,
        'latitude', it.latitude, 'longitude', it.longitude,
        'start_time', it.start_time, 'end_time', it.end_time, 'travel_minutes', it.travel_minutes,
        'attraction_slug', a.slug
      ) ORDER BY it.day_number, it.item_order)
      FROM tours_itinerary_items it LEFT JOIN tours_attractions a ON a.id = it.attraction_id AND a.is_active
      WHERE it.itinerary_id = i.id
    ), '[]'::jsonb)
  )
  FROM tours_itineraries i
  JOIN tours_itinerary_shares s ON s.itinerary_id = i.id AND s.friend_id = auth.uid()
  JOIN profiles p ON p.id = i.tourist_id
  WHERE i.id = p_itinerary AND tours_are_friends(auth.uid(), i.tourist_id);
$$;

REVOKE ALL ON FUNCTION public.tours_find_people(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tours_send_friend_request(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tours_respond_friend_request(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tours_remove_friend(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tours_my_friends() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tours_share_itinerary_with(uuid, uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tours_itineraries_shared_with_me() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tours_friend_itinerary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tours_find_people(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tours_send_friend_request(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tours_respond_friend_request(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tours_remove_friend(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tours_my_friends() TO authenticated;
GRANT EXECUTE ON FUNCTION public.tours_share_itinerary_with(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tours_itineraries_shared_with_me() TO authenticated;
GRANT EXECUTE ON FUNCTION public.tours_friend_itinerary(uuid) TO authenticated;
