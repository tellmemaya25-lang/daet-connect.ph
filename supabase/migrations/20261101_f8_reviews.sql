-- ================================================================
-- F8: Reviews & ratings
--
-- One review per completed booking, written only by its tourist through
-- tours_submit_review (the tables had full anon/authenticated grants).
-- Operators post one public reply; admins hide abusive reviews. Hidden
-- reviews disappear from public reads and from the rating views, which run
-- as the caller (security_invoker) so the same RLS applies.
-- ================================================================

ALTER TABLE public.tours_reviews
  ADD COLUMN IF NOT EXISTS operator_reply text CHECK (char_length(operator_reply) <= 1000),
  ADD COLUMN IF NOT EXISTS replied_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hidden_reason text CHECK (char_length(hidden_reason) <= 300),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.tours_reviews ADD CONSTRAINT tours_reviews_comment_length CHECK (char_length(comment) <= 2000) NOT VALID;
CREATE INDEX IF NOT EXISTS idx_tours_reviews_package ON public.tours_reviews (package_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tours_reviews_operator ON public.tours_reviews (operator_id);
CREATE INDEX IF NOT EXISTS idx_tours_reviews_guide ON public.tours_reviews (guide_id) WHERE guide_id IS NOT NULL;

REVOKE ALL ON public.tours_reviews FROM anon, authenticated;
GRANT SELECT ON public.tours_reviews TO anon, authenticated;

-- Definer helper: anon cannot read tours_operators, and a policy subquery
-- on it would fail for anonymous readers even when NOT is_hidden is true.
CREATE OR REPLACE FUNCTION public.tours_is_my_operator(p_operator_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM tours_operators WHERE id = p_operator_id AND profile_id = auth.uid());
$fn$;
REVOKE EXECUTE ON FUNCTION public.tours_is_my_operator(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tours_is_my_operator(uuid) TO anon, authenticated;

ALTER POLICY "Public views all reviews" ON public.tours_reviews TO anon, authenticated
  USING (
    NOT is_hidden
    OR tourist_id = auth.uid()
    OR get_my_role() = 'admin'
    OR public.tours_is_my_operator(operator_id)
  );
ALTER POLICY "Public views all reviews" ON public.tours_reviews RENAME TO tours_reviews_read;
ALTER POLICY "Admin manages all reviews" ON public.tours_reviews TO authenticated;

-- ----------------------------------------------------------------
-- Writes
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tours_submit_review(p_booking_id uuid, p_rating integer, p_comment text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  b tours_bookings%ROWTYPE;
  v_operator uuid;
  v_id uuid;
  v_comment text := NULLIF(btrim(COALESCE(p_comment, '')), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to leave a review.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO b FROM tours_bookings WHERE id = p_booking_id AND user_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found.' USING ERRCODE = 'no_data_found';
  END IF;
  IF b.status <> 'completed' THEN
    RAISE EXCEPTION 'You can review a tour after it is completed.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'Choose a rating from 1 to 5 stars.' USING ERRCODE = 'check_violation';
  END IF;
  IF char_length(v_comment) > 2000 THEN
    RAISE EXCEPTION 'Reviews can be at most 2000 characters.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT operator_id INTO v_operator FROM tours_packages WHERE id = b.package_id;

  INSERT INTO tours_reviews (booking_id, tourist_id, operator_id, guide_id, package_id, rating, comment)
  VALUES (b.id, b.user_id, v_operator, b.assigned_guide_id, b.package_id, p_rating, v_comment)
  ON CONFLICT (booking_id) DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'You already reviewed this tour.' USING ERRCODE = 'unique_violation';
  END IF;
  RETURN v_id;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.tours_reply_to_review(p_review_id uuid, p_reply text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  r tours_reviews%ROWTYPE;
  v_reply text := NULLIF(btrim(COALESCE(p_reply, '')), '');
BEGIN
  SELECT * INTO r FROM tours_reviews WHERE id = p_review_id;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM tours_operators WHERE id = r.operator_id AND profile_id = auth.uid() AND accreditation_status = 'approved'
  ) THEN
    RAISE EXCEPTION 'Only the operator of this tour can reply.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_reply IS NOT NULL AND (char_length(v_reply) < 2 OR char_length(v_reply) > 1000) THEN
    RAISE EXCEPTION 'Replies must be 2 to 1000 characters.' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE tours_reviews
     SET operator_reply = v_reply, replied_at = CASE WHEN v_reply IS NULL THEN NULL ELSE now() END, updated_at = now()
   WHERE id = r.id;
  IF v_reply IS NOT NULL AND r.operator_reply IS NULL THEN
    PERFORM tours_notify(r.tourist_id, 'review_reply', 'The operator replied to your review', left(v_reply, 140), '/tours/bookings/' || r.booking_id);
  END IF;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.tours_set_review_hidden(p_review_id uuid, p_hidden boolean, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF get_my_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only admins can moderate reviews.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE tours_reviews
     SET is_hidden = p_hidden,
         hidden_reason = CASE WHEN p_hidden THEN NULLIF(left(btrim(COALESCE(p_reason, '')), 300), '') ELSE NULL END,
         updated_at = now()
   WHERE id = p_review_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Review not found.' USING ERRCODE = 'no_data_found';
  END IF;
END;
$fn$;

-- ----------------------------------------------------------------
-- Rating views (respect RLS: hidden reviews are left out for the public)
-- ----------------------------------------------------------------
CREATE OR REPLACE VIEW public.tours_package_ratings WITH (security_invoker = true) AS
  SELECT package_id, count(*)::int AS review_count, round(avg(rating)::numeric, 2) AS average_rating
  FROM tours_reviews WHERE NOT is_hidden GROUP BY package_id;
CREATE OR REPLACE VIEW public.tours_operator_ratings WITH (security_invoker = true) AS
  SELECT operator_id, count(*)::int AS review_count, round(avg(rating)::numeric, 2) AS average_rating
  FROM tours_reviews WHERE NOT is_hidden GROUP BY operator_id;
CREATE OR REPLACE VIEW public.tours_guide_ratings WITH (security_invoker = true) AS
  SELECT guide_id, count(*)::int AS review_count, round(avg(rating)::numeric, 2) AS average_rating
  FROM tours_reviews WHERE NOT is_hidden AND guide_id IS NOT NULL GROUP BY guide_id;
REVOKE ALL ON public.tours_package_ratings, public.tours_operator_ratings, public.tours_guide_ratings FROM anon, authenticated;
GRANT SELECT ON public.tours_package_ratings, public.tours_operator_ratings, public.tours_guide_ratings TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.tours_submit_review(uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tours_submit_review(uuid, integer, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.tours_reply_to_review(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tours_reply_to_review(uuid, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.tours_set_review_hidden(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tours_set_review_hidden(uuid, boolean, text) TO authenticated;

-- 4. Reviews belong to a booking (lets the operator page join booking details).
ALTER TABLE public.tours_reviews
  ADD CONSTRAINT tours_reviews_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.tours_bookings(id) ON DELETE CASCADE;
NOTIFY pgrst, 'reload schema';
