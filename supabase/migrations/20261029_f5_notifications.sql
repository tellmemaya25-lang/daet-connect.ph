-- ================================================================
-- F5: In-app notifications + Web Push
--
-- Notifications are written by database triggers, so every path that
-- changes a booking (Server Actions, the PayMongo webhook, cancellation and
-- check-in functions) notifies the right people. Nobody is notified about
-- their own action. Each new row is pushed to the recipient's devices by the
-- app (/api/notifications/push) through pg_net, after the transaction
-- commits. The push endpoint and its secret live in Vault:
--   select vault.create_secret('https://<app>/api/notifications/push', 'tours_push_endpoint');
--   select vault.create_secret('<same value as NOTIFICATIONS_PUSH_SECRET>', 'tours_push_secret');
-- Without them, notifications still appear in the app; only push is off.
-- ================================================================

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- ----------------------------------------------------------------
-- 1. Table
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tours_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  link text,
  read_at timestamptz,
  pushed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tours_notifications_profile ON public.tours_notifications (profile_id, created_at DESC);

ALTER TABLE public.tours_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tours_notifications FROM anon, authenticated;
GRANT SELECT ON public.tours_notifications TO authenticated;
GRANT UPDATE (read_at) ON public.tours_notifications TO authenticated;
CREATE POLICY tours_notifications_select_own ON public.tours_notifications FOR SELECT TO authenticated
  USING (profile_id = auth.uid());
CREATE POLICY tours_notifications_mark_read_own ON public.tours_notifications FOR UPDATE TO authenticated
  USING (profile_id = auth.uid()) WITH CHECK (profile_id = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE public.tours_notifications;

-- Push subscriptions: own rows only, never anonymous.
REVOKE ALL ON public.push_subscriptions FROM anon;
ALTER POLICY "User manages own push subscription" ON public.push_subscriptions TO authenticated;

-- ----------------------------------------------------------------
-- 2. Helpers
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tours_notify(p_profile_id uuid, p_type text, p_title text, p_body text, p_link text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF p_profile_id IS NULL OR p_profile_id = auth.uid() THEN
    RETURN;
  END IF;
  INSERT INTO tours_notifications (profile_id, type, title, body, link)
  VALUES (p_profile_id, p_type, left(p_title, 120), left(p_body, 300), p_link);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.tours_peso(p_amount numeric)
RETURNS text LANGUAGE sql IMMUTABLE AS $fn$
  SELECT '₱' || to_char(COALESCE(p_amount, 0), 'FM999,999,990.00');
$fn$;

-- Booking facts most notifications need.
CREATE OR REPLACE FUNCTION public.tours_booking_context(p_booking_id uuid)
RETURNS TABLE (tourist uuid, operator_profile uuid, guide_profile uuid, title text, tour_day text, reference text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT b.user_id, o.profile_id, g.profile_id, p.title, to_char(b.tour_date, 'Mon DD, YYYY'), b.booking_reference::text
  FROM tours_bookings b
  JOIN tours_packages p ON p.id = b.package_id
  JOIN tours_operators o ON o.id = p.operator_id
  LEFT JOIN tours_guides g ON g.id = b.assigned_guide_id
  WHERE b.id = p_booking_id;
$fn$;

-- ----------------------------------------------------------------
-- 3. Push dispatch (async via pg_net; never blocks or fails the insert)
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tours_notifications_dispatch_push()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_url text;
  v_secret text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM push_subscriptions WHERE profile_id = NEW.profile_id) THEN
    RETURN NULL;
  END IF;
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'tours_push_endpoint';
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'tours_push_secret';
  IF v_url IS NULL OR v_secret IS NULL THEN
    RETURN NULL;
  END IF;
  PERFORM net.http_post(
    url := v_url,
    body := jsonb_build_object('notification_id', NEW.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
    timeout_milliseconds := 5000
  );
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'tours push dispatch skipped: %', SQLERRM;
  RETURN NULL;
END;
$fn$;

CREATE OR REPLACE TRIGGER trg_tours_notifications_dispatch_push
AFTER INSERT ON public.tours_notifications
FOR EACH ROW EXECUTE FUNCTION public.tours_notifications_dispatch_push();

-- ----------------------------------------------------------------
-- 4. Booking events
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tours_notify_booking_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  c record;
  v_link text := '/tours/bookings/' || NEW.id;
  v_reason text := COALESCE(NULLIF(btrim(NEW.cancellation_reason), ''), 'No reason given.');
BEGIN
  SELECT * INTO c FROM public.tours_booking_context(NEW.id);

  IF TG_OP = 'INSERT' THEN
    PERFORM tours_notify(c.operator_profile, 'booking_created', 'New booking request',
      format('%s · %s pax · %s', c.title, NEW.number_of_pax, c.tour_day), '/tours/operator/bookings?status=pending');
    RETURN NULL;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'confirmed' THEN
      PERFORM tours_notify(c.tourist, 'booking_confirmed', 'Booking confirmed',
        format('%s on %s is confirmed. Your ticket QR is ready.', c.title, c.tour_day), v_link);
    ELSIF NEW.status = 'rejected' THEN
      PERFORM tours_notify(c.tourist, 'booking_declined', 'Booking declined', format('%s: %s', c.title, v_reason), v_link);
    ELSIF NEW.status = 'cancelled' THEN
      IF NEW.cancelled_by = NEW.user_id THEN
        PERFORM tours_notify(c.operator_profile, 'booking_cancelled', 'A tourist cancelled',
          format('%s · %s (%s): %s', c.reference, c.title, c.tour_day, v_reason), '/tours/operator/bookings');
      ELSIF EXISTS (SELECT 1 FROM tours_cancellations WHERE booking_id = NEW.id AND status = 'requested') THEN
        PERFORM tours_notify(c.tourist, 'cancellation_approved', 'Cancellation approved',
          format('%s on %s is cancelled. Any refund will be sent by the operator.', c.title, c.tour_day), v_link);
      ELSE
        PERFORM tours_notify(c.tourist, 'booking_cancelled', 'Booking cancelled by the operator', format('%s: %s', c.title, v_reason), v_link);
      END IF;
      PERFORM tours_notify(c.guide_profile, 'booking_cancelled', 'Tour cancelled', format('%s on %s was cancelled.', c.title, c.tour_day), '/tours/guide/my-tours');
    ELSIF NEW.status = 'completed' THEN
      PERFORM tours_notify(c.tourist, 'booking_completed', 'How was your tour?',
        format('Thanks for joining %s. Leave a review to help other travellers.', c.title), v_link);
    END IF;
  END IF;

  IF NEW.assigned_guide_id IS DISTINCT FROM OLD.assigned_guide_id AND NEW.assigned_guide_id IS NOT NULL THEN
    PERFORM tours_notify(c.guide_profile, 'guide_assigned', 'New tour assigned',
      format('%s · %s · %s pax', c.title, c.tour_day, NEW.number_of_pax), '/tours/guide/my-tours');
    PERFORM tours_notify(c.tourist, 'guide_assigned', 'Your guide is assigned',
      format('A local guide will lead %s on %s.', c.title, c.tour_day), v_link);
  END IF;
  RETURN NULL;
END;
$fn$;

CREATE OR REPLACE TRIGGER trg_tours_notify_booking_insert
AFTER INSERT ON public.tours_bookings
FOR EACH ROW EXECUTE FUNCTION public.tours_notify_booking_events();
CREATE OR REPLACE TRIGGER trg_tours_notify_booking_update
AFTER UPDATE OF status, assigned_guide_id ON public.tours_bookings
FOR EACH ROW EXECUTE FUNCTION public.tours_notify_booking_events();

-- ----------------------------------------------------------------
-- 5. Payments, receipts, cancellations, check-in
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tours_notify_payment_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  c record;
BEGIN
  SELECT * INTO c FROM public.tours_booking_context(NEW.booking_id);
  IF NEW.payment_status = 'completed' THEN
    PERFORM tours_notify(c.tourist, 'payment_received', 'Payment received',
      format('%s for %s (%s).', tours_peso(NEW.amount), c.title, c.reference), '/tours/bookings/' || NEW.booking_id);
    PERFORM tours_notify(c.operator_profile, 'payment_received', 'Payment received',
      format('%s from %s for %s.', tours_peso(NEW.amount), c.reference, c.title), '/tours/operator/payments');
  ELSIF NEW.payment_status = 'refunded' THEN
    PERFORM tours_notify(c.tourist, 'refund_recorded', 'Refund sent',
      format('%s was refunded for %s.', tours_peso(NEW.amount), c.title), '/tours/bookings/' || NEW.booking_id);
  END IF;
  RETURN NULL;
END;
$fn$;

CREATE OR REPLACE TRIGGER trg_tours_notify_payment
AFTER INSERT ON public.tours_payments
FOR EACH ROW EXECUTE FUNCTION public.tours_notify_payment_events();

CREATE OR REPLACE FUNCTION public.tours_notify_proof_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  c record;
BEGIN
  SELECT * INTO c FROM public.tours_booking_context(NEW.booking_id);
  IF TG_OP = 'INSERT' THEN
    PERFORM tours_notify(c.operator_profile, 'proof_submitted', 'Receipt to verify',
      format('%s sent a %s receipt for %s.', c.reference, tours_peso(NEW.amount), c.title), '/tours/operator/bookings');
  ELSIF NEW.verification_status IS DISTINCT FROM OLD.verification_status AND NEW.verification_status::text = 'rejected' THEN
    PERFORM tours_notify(c.tourist, 'proof_rejected', 'Receipt not accepted',
      COALESCE(NULLIF(btrim(NEW.rejection_reason), ''), 'The operator could not match this payment.'), '/tours/bookings/' || NEW.booking_id);
  END IF;
  RETURN NULL;
END;
$fn$;

CREATE OR REPLACE TRIGGER trg_tours_notify_proof
AFTER INSERT OR UPDATE OF verification_status ON public.tours_payment_proofs
FOR EACH ROW EXECUTE FUNCTION public.tours_notify_proof_events();

CREATE OR REPLACE FUNCTION public.tours_notify_cancellation_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  c record;
BEGIN
  SELECT * INTO c FROM public.tours_booking_context(NEW.booking_id);
  IF NEW.status::text = 'requested' AND (TG_OP = 'INSERT' OR OLD.status::text <> 'requested') THEN
    PERFORM tours_notify(c.operator_profile, 'cancellation_requested', 'Cancellation requested',
      format('%s · %s (%s): %s', c.reference, c.title, c.tour_day, NEW.reason), '/tours/operator/bookings');
  ELSIF TG_OP = 'UPDATE' AND NEW.status::text = 'rejected' AND OLD.status::text = 'requested' THEN
    PERFORM tours_notify(c.tourist, 'cancellation_declined', 'Cancellation declined',
      COALESCE(NEW.admin_notes, 'The operator kept your booking active.'), '/tours/bookings/' || NEW.booking_id);
  END IF;
  RETURN NULL;
END;
$fn$;

CREATE OR REPLACE TRIGGER trg_tours_notify_cancellation
AFTER INSERT OR UPDATE OF status ON public.tours_cancellations
FOR EACH ROW EXECUTE FUNCTION public.tours_notify_cancellation_events();

CREATE OR REPLACE FUNCTION public.tours_notify_checkin_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  c record;
BEGIN
  IF NEW.participant_id IS NULL THEN
    SELECT * INTO c FROM public.tours_booking_context(NEW.booking_id);
    PERFORM tours_notify(c.tourist, 'checked_in', 'You''re checked in', format('Enjoy %s!', c.title), '/tours/bookings/' || NEW.booking_id);
  END IF;
  RETURN NULL;
END;
$fn$;

CREATE OR REPLACE TRIGGER trg_tours_notify_checkin
AFTER INSERT ON public.tours_checkins
FOR EACH ROW EXECUTE FUNCTION public.tours_notify_checkin_events();

-- ----------------------------------------------------------------
-- 6. Messages (one unread notification per thread per 10 minutes)
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tours_notify_message_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  c record;
  v_link text := '/tours/messages/' || NEW.conversation_id;
  v_body text := COALESCE(left(NEW.message_text, 140), '📷 Photo');
  v_recipient uuid;
BEGIN
  SELECT ctx.* INTO c FROM tours_conversations conv, LATERAL public.tours_booking_context(conv.booking_id) ctx
   WHERE conv.id = NEW.conversation_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  FOREACH v_recipient IN ARRAY ARRAY[c.tourist, c.operator_profile, c.guide_profile] LOOP
    IF v_recipient IS NOT NULL AND v_recipient <> NEW.sender_id AND NOT EXISTS (
      SELECT 1 FROM tours_notifications
       WHERE profile_id = v_recipient AND type = 'message' AND link = v_link
         AND read_at IS NULL AND created_at > now() - interval '10 minutes'
    ) THEN
      PERFORM tours_notify(v_recipient, 'message', 'New message · ' || c.title, v_body, v_link);
    END IF;
  END LOOP;
  RETURN NULL;
END;
$fn$;

CREATE OR REPLACE TRIGGER trg_tours_notify_message
AFTER INSERT ON public.tours_messages
FOR EACH ROW EXECUTE FUNCTION public.tours_notify_message_events();

-- ----------------------------------------------------------------
-- 7. Accreditation, package review, reviews
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tours_notify_accreditation_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_kind text := CASE WHEN TG_TABLE_NAME = 'tours_guides' THEN 'guide' ELSE 'operator' END;
BEGIN
  IF NEW.accreditation_status IS NOT DISTINCT FROM OLD.accreditation_status THEN
    RETURN NULL;
  END IF;
  IF NEW.accreditation_status::text = 'approved' THEN
    PERFORM tours_notify(NEW.profile_id, 'accreditation_approved', 'You''re accredited!',
      CASE WHEN v_kind = 'guide' THEN 'Your guide badge QR is ready.' ELSE 'You can now publish packages and take bookings.' END,
      '/tours/' || v_kind || '/dashboard');
  ELSIF NEW.accreditation_status::text = 'rejected' THEN
    PERFORM tours_notify(NEW.profile_id, 'accreditation_rejected', 'Application needs changes',
      COALESCE(NULLIF(btrim(NEW.accreditation_notes), ''), 'See the Tourism Office''s notes and resubmit.'),
      '/tours/' || v_kind || '/register');
  END IF;
  RETURN NULL;
END;
$fn$;

CREATE OR REPLACE TRIGGER trg_tours_notify_guide_accreditation
AFTER UPDATE OF accreditation_status ON public.tours_guides
FOR EACH ROW EXECUTE FUNCTION public.tours_notify_accreditation_events();
CREATE OR REPLACE TRIGGER trg_tours_notify_operator_accreditation
AFTER UPDATE OF accreditation_status ON public.tours_operators
FOR EACH ROW EXECUTE FUNCTION public.tours_notify_accreditation_events();

CREATE OR REPLACE FUNCTION public.tours_notify_package_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_operator uuid;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status OR OLD.status::text <> 'pending_review' THEN
    RETURN NULL;
  END IF;
  SELECT profile_id INTO v_operator FROM tours_operators WHERE id = NEW.operator_id;
  IF NEW.status::text = 'published' THEN
    PERFORM tours_notify(v_operator, 'package_approved', 'Package published', format('%s is now live for tourists.', NEW.title),
      '/tours/operator/packages/' || NEW.id);
  ELSIF NEW.status::text = 'rejected' THEN
    PERFORM tours_notify(v_operator, 'package_rejected', 'Package needs changes',
      format('%s: %s', NEW.title, COALESCE(NULLIF(btrim(NEW.rejection_reason), ''), 'See the review notes.')), '/tours/operator/packages/' || NEW.id);
  END IF;
  RETURN NULL;
END;
$fn$;

CREATE OR REPLACE TRIGGER trg_tours_notify_package
AFTER UPDATE OF status ON public.tours_packages
FOR EACH ROW EXECUTE FUNCTION public.tours_notify_package_events();

CREATE OR REPLACE FUNCTION public.tours_notify_review_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  c record;
  v_stars text := repeat('★', GREATEST(1, LEAST(5, COALESCE(NEW.rating, 0))));
BEGIN
  SELECT * INTO c FROM public.tours_booking_context(NEW.booking_id);
  PERFORM tours_notify(c.operator_profile, 'review_received', 'New review ' || v_stars,
    format('%s: %s', c.title, COALESCE(left(NEW.comment, 140), 'No comment.')), '/tours/operator/packages/' || NEW.package_id);
  PERFORM tours_notify(c.guide_profile, 'review_received', 'New review ' || v_stars,
    format('%s: %s', c.title, COALESCE(left(NEW.comment, 140), 'No comment.')), '/tours/guide/my-tours');
  RETURN NULL;
END;
$fn$;

CREATE OR REPLACE TRIGGER trg_tours_notify_review
AFTER INSERT ON public.tours_reviews
FOR EACH ROW EXECUTE FUNCTION public.tours_notify_review_events();

-- ----------------------------------------------------------------
-- 8. Function privileges: none of these are client-callable
-- ----------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.tours_notify(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tours_booking_context(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tours_notifications_dispatch_push() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tours_notify_booking_events() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tours_notify_payment_events() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tours_notify_proof_events() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tours_notify_cancellation_events() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tours_notify_checkin_events() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tours_notify_message_events() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tours_notify_accreditation_events() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tours_notify_package_events() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tours_notify_review_events() FROM PUBLIC, anon, authenticated;
