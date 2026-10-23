-- ================================================================
-- F1: Payments — PayMongo sandbox + unified ledger + booking integrity
--
-- 1. tours_payments becomes the single ledger (manual + PayMongo rows).
-- 2. tours_payment_events makes webhook processing idempotent.
-- 3. tours_payment_proofs: tourists upload GCash/bank proofs; operators verify.
-- 4. Booking integrity: the database computes the price on insert, and only
--    the ledger trigger can change total_amount / total_paid / payment_status.
-- 5. RLS: bookings, payments and proofs were readable (bookings even
--    updatable) by every signed-in user. Now scoped to tourist / operator /
--    assigned guide / admin. Existing policies are rewritten in place with
--    ALTER POLICY.
-- 6. The unused, empty tours_booking_payments table (duplicate ledger whose
--    policies let any signed-in user insert and read) loses all API access.
--    It can be dropped later with: DROP TABLE tours_booking_payments;
--
-- Written without DROP statements so it can be applied through tooling that
-- requires interactive confirmation for destructive SQL.
-- ================================================================

-- ----------------------------------------------------------------
-- 1. Ledger columns
-- ----------------------------------------------------------------
ALTER TABLE tours_payments ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'manual'
  CONSTRAINT tours_payments_provider_check CHECK (provider IN ('manual', 'paymongo'));
ALTER TABLE tours_payments ADD COLUMN IF NOT EXISTS provider_ref text;
-- Exact PayMongo method (gcash, paymaya, card, grab_pay, qrph, dob, ...).
-- payment_method keeps its existing allowed values (card -> credit_card, others -> other).
ALTER TABLE tours_payments ADD COLUMN IF NOT EXISTS provider_method text;
ALTER TABLE tours_payments ADD COLUMN IF NOT EXISTS raw_event jsonb;
-- Not partial: PostgREST upserts (on_conflict=provider,provider_ref) need a plain
-- unique index. Manual rows have provider_ref NULL, and NULLs never conflict.
CREATE UNIQUE INDEX IF NOT EXISTS tours_payments_provider_ref_key
  ON tours_payments (provider, provider_ref);

-- ----------------------------------------------------------------
-- 2. Webhook idempotency (service role only: RLS on, no policies)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tours_payment_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  livemode boolean NOT NULL DEFAULT false,
  booking_id uuid REFERENCES tours_bookings(id) ON DELETE SET NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  outcome text,
  payload jsonb NOT NULL
);
ALTER TABLE tours_payment_events ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------
-- 3. Payment proofs (table is empty, so NOT NULL columns are safe)
-- ----------------------------------------------------------------
ALTER TABLE tours_payment_proofs ADD COLUMN IF NOT EXISTS amount numeric(10, 2) NOT NULL
  CONSTRAINT tours_payment_proofs_amount_check CHECK (amount > 0);
ALTER TABLE tours_payment_proofs ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'gcash'
  CONSTRAINT tours_payment_proofs_method_check CHECK (payment_method IN ('gcash', 'bank_transfer', 'paymaya', 'other'));
ALTER TABLE tours_payment_proofs ADD COLUMN IF NOT EXISTS submitted_by uuid REFERENCES profiles(id);
ALTER TABLE tours_payment_proofs ADD COLUMN IF NOT EXISTS payment_id uuid REFERENCES tours_payments(id) ON DELETE SET NULL;
ALTER TABLE tours_payment_proofs ADD CONSTRAINT tours_payment_proofs_booking_id_fkey
  FOREIGN KEY (booking_id) REFERENCES tours_bookings(id) ON DELETE CASCADE;

-- Private bucket: objects live under <booking_id>/<uuid>.<ext>
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('tours-payment-proofs', 'tours-payment-proofs', false, 5242880,
        ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------
-- 4a. Helper predicates (SECURITY DEFINER so policies can use them without
--     recursive RLS on the joined tables)
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tours_is_booking_operator(p_booking_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM tours_bookings b
    JOIN tours_packages p ON p.id = b.package_id
    JOIN tours_operators o ON o.id = p.operator_id
    WHERE b.id = p_booking_id AND o.profile_id = auth.uid()
  );
$fn$;

CREATE OR REPLACE FUNCTION public.tours_is_booking_tourist(p_booking_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT EXISTS (SELECT 1 FROM tours_bookings b WHERE b.id = p_booking_id AND b.user_id = auth.uid());
$fn$;

CREATE OR REPLACE FUNCTION public.tours_is_booking_guide(p_booking_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM tours_bookings b JOIN tours_guides g ON g.id = b.assigned_guide_id
    WHERE b.id = p_booking_id AND g.profile_id = auth.uid()
  );
$fn$;

REVOKE EXECUTE ON FUNCTION public.tours_is_booking_operator(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.tours_is_booking_tourist(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.tours_is_booking_guide(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tours_is_booking_operator(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tours_is_booking_tourist(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tours_is_booking_guide(uuid) TO authenticated;

-- ----------------------------------------------------------------
-- 4b. Price is computed by the database on insert
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tours_bookings_before_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_variant tours_package_price_variants%ROWTYPE;
  v_status package_status;
BEGIN
  SELECT status INTO v_status FROM tours_packages WHERE id = NEW.package_id;
  IF v_status IS DISTINCT FROM 'published' THEN
    RAISE EXCEPTION 'This package is not available for booking.' USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.price_variant_id IS NULL THEN
    RAISE EXCEPTION 'Choose a price option.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_variant FROM tours_package_price_variants
   WHERE id = NEW.price_variant_id AND package_id = NEW.package_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Selected price option is not valid.' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.number_of_pax < v_variant.min_pax OR (v_variant.max_pax IS NOT NULL AND NEW.number_of_pax > v_variant.max_pax) THEN
    RAISE EXCEPTION 'Number of participants is outside the allowed range for this option.' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.tour_date < (now() AT TIME ZONE 'Asia/Manila')::date THEN
    RAISE EXCEPTION 'Tour date cannot be in the past.' USING ERRCODE = 'check_violation';
  END IF;

  IF v_variant.price_per_pax IS NOT NULL THEN
    NEW.price_per_pax := v_variant.price_per_pax;
    NEW.total_amount := v_variant.price_per_pax * NEW.number_of_pax;
  ELSE
    NEW.price_per_pax := NULL;
    NEW.total_amount := v_variant.flat_price;
  END IF;

  NEW.status := 'pending';
  NEW.total_paid := 0;
  NEW.payment_status := 'unpaid';
  NEW.assigned_guide_id := NULL;
  NEW.cancellation_reason := NULL;
  NEW.cancelled_at := NULL;
  NEW.cancelled_by := NULL;
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE TRIGGER trg_tours_bookings_before_insert
BEFORE INSERT ON tours_bookings
FOR EACH ROW EXECUTE FUNCTION public.tours_bookings_before_insert();

-- ----------------------------------------------------------------
-- 4c. Only workflow columns are updatable by signed-in users. Money columns
--     are written by the ledger trigger (SECURITY DEFINER) only.
-- ----------------------------------------------------------------
REVOKE UPDATE ON tours_bookings FROM anon, authenticated;
GRANT UPDATE (status, assigned_guide_id, cancellation_reason, cancelled_at, cancelled_by)
  ON tours_bookings TO authenticated;

ALTER FUNCTION public.update_booking_payment_status() SECURITY DEFINER;

-- ----------------------------------------------------------------
-- 5. RLS: bookings (existing policies rewritten in place)
-- ----------------------------------------------------------------
ALTER POLICY "Allow authenticated read" ON tours_bookings TO authenticated USING (
  user_id = auth.uid()
  OR public.tours_is_booking_operator(id)
  OR public.tours_is_booking_guide(id)
  OR get_my_role() = 'admin'
);
ALTER POLICY "Allow authenticated read" ON tours_bookings RENAME TO tours_bookings_select;

ALTER POLICY "Allow authenticated insert" ON tours_bookings TO authenticated WITH CHECK (user_id = auth.uid());
ALTER POLICY "Allow authenticated insert" ON tours_bookings RENAME TO tours_bookings_insert;

ALTER POLICY "Allow authenticated update" ON tours_bookings TO authenticated
  USING (public.tours_is_booking_operator(id) OR get_my_role() = 'admin')
  WITH CHECK (public.tours_is_booking_operator(id) OR get_my_role() = 'admin');
ALTER POLICY "Allow authenticated update" ON tours_bookings RENAME TO tours_bookings_update;

-- ----------------------------------------------------------------
-- 5b. RLS: payments ledger
-- ----------------------------------------------------------------
ALTER POLICY "Auth users read completed payments" ON tours_payments TO authenticated USING (
  public.tours_is_booking_tourist(booking_id)
  OR public.tours_is_booking_operator(booking_id)
  OR get_my_role() = 'admin'
);
ALTER POLICY "Auth users read completed payments" ON tours_payments RENAME TO tours_payments_select;

-- Operators record manual payments only; PayMongo rows come from the webhook (service role).
ALTER POLICY "Operators insert payments" ON tours_payments TO authenticated WITH CHECK (
  provider = 'manual' AND provider_ref IS NULL AND recorded_by = auth.uid()
  AND public.tours_is_booking_operator(booking_id)
);
ALTER POLICY "Operators insert payments" ON tours_payments RENAME TO tours_payments_insert_manual;

ALTER POLICY "Operators update own payments" ON tours_payments TO authenticated
  USING (provider = 'manual' AND public.tours_is_booking_operator(booking_id))
  WITH CHECK (provider = 'manual' AND public.tours_is_booking_operator(booking_id));
ALTER POLICY "Operators update own payments" ON tours_payments RENAME TO tours_payments_update_manual;

ALTER POLICY "Operators delete own payments" ON tours_payments TO authenticated
  USING (provider = 'manual' AND public.tours_is_booking_operator(booking_id));
ALTER POLICY "Operators delete own payments" ON tours_payments RENAME TO tours_payments_delete_manual;

-- ----------------------------------------------------------------
-- 5c. RLS: payment proofs (+ storage objects)
-- ----------------------------------------------------------------
CREATE POLICY tours_payment_proofs_tourist_insert ON tours_payment_proofs FOR INSERT TO authenticated WITH CHECK (
  submitted_by = auth.uid() AND verification_status = 'pending'
  AND verified_by IS NULL AND payment_id IS NULL
  AND public.tours_is_booking_tourist(booking_id)
);
CREATE POLICY tours_payment_proofs_select ON tours_payment_proofs FOR SELECT TO authenticated USING (
  public.tours_is_booking_tourist(booking_id) OR public.tours_is_booking_operator(booking_id)
);
CREATE POLICY tours_payment_proofs_operator_update ON tours_payment_proofs FOR UPDATE TO authenticated
  USING (public.tours_is_booking_operator(booking_id))
  WITH CHECK (public.tours_is_booking_operator(booking_id));

CREATE POLICY tours_payment_proofs_object_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'tours-payment-proofs'
  AND public.tours_is_booking_tourist(((storage.foldername(name))[1])::uuid)
);
CREATE POLICY tours_payment_proofs_object_read ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'tours-payment-proofs'
  AND (
    public.tours_is_booking_tourist(((storage.foldername(name))[1])::uuid)
    OR public.tours_is_booking_operator(((storage.foldername(name))[1])::uuid)
    OR get_my_role() = 'admin'
  )
);

-- ----------------------------------------------------------------
-- 6. Retire the duplicate ledger: no API access at all.
-- ----------------------------------------------------------------
REVOKE ALL ON tours_booking_payments FROM anon, authenticated;
