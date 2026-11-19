-- A pending booking holds its seats and its slot only for a while.
--
-- 1. tours_bookings.hold_expires_at: when an unpaid pending booking stops
--    holding anything. Set by the insert trigger from the package's hold window.
-- 2. tours_packages.hold_minutes: how long an operator gives a tourist to pay.
--    0 means "no hold" — the booking never expires on its own, which is the
--    behaviour every existing package keeps.
-- 3. tours_expire_pending_holds(): cancels overdue unpaid holds and frees the
--    seats. Called by the sweep endpoint (src/app/api/cron/booking-holds).
--
-- Without this, one abandoned checkout holds a date shut forever, because
-- tours_count_booked_seats() counts pending bookings.
--
-- Applied by hand in the Supabase SQL editor.

-- ---------------------------------------------------------------- 1. The window

ALTER TABLE public.tours_packages
  ADD COLUMN IF NOT EXISTS hold_minutes integer NOT NULL DEFAULT 0;

ALTER TABLE public.tours_packages DROP CONSTRAINT IF EXISTS tours_packages_hold_minutes_check;
ALTER TABLE public.tours_packages ADD CONSTRAINT tours_packages_hold_minutes_check
  CHECK (hold_minutes >= 0 AND hold_minutes <= 2880);

ALTER TABLE public.tours_bookings
  ADD COLUMN IF NOT EXISTS hold_expires_at timestamptz;

COMMENT ON COLUMN public.tours_bookings.hold_expires_at IS
  'When an unpaid pending booking stops holding its seats. NULL = no limit.';
COMMENT ON COLUMN public.tours_packages.hold_minutes IS
  'Minutes a tourist has to pay before the booking is released. 0 = never.';

-- The sweep looks for overdue holds; the partial index keeps it cheap.
CREATE INDEX IF NOT EXISTS idx_tours_bookings_hold_due
  ON public.tours_bookings (hold_expires_at)
  WHERE status = 'pending' AND hold_expires_at IS NOT NULL;

-- Operators set their own hold window; 0 (never) is the default they already have.
CREATE OR REPLACE FUNCTION public.tours_bookings_set_hold()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_minutes integer;
BEGIN
  SELECT hold_minutes INTO v_minutes FROM tours_packages WHERE id = NEW.package_id;

  -- Named a2_ so it runs early, which means it sees the row before
  -- tours_bookings_before_insert() prices it and forces status = 'pending'.
  -- On INSERT a booking is always a pending hold, even when the client sent no
  -- status, so that is what we assume here.
  IF TG_OP = 'INSERT' THEN
    NEW.hold_expires_at := CASE
      WHEN COALESCE(v_minutes, 0) > 0 THEN now() + make_interval(mins => v_minutes)
      ELSE NULL
    END;
  -- Later: a booking that is paid or no longer pending never expires.
  ELSIF NEW.status = 'pending' AND COALESCE(NEW.total_paid, 0) = 0 THEN
    NEW.hold_expires_at := CASE
      WHEN COALESCE(v_minutes, 0) > 0
        THEN COALESCE(NEW.hold_expires_at, now() + make_interval(mins => v_minutes))
      ELSE NULL
    END;
  ELSE
    NEW.hold_expires_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tours_bookings_set_hold() FROM PUBLIC, anon, authenticated;

-- Runs before before_insert, so a priced booking still gets its hold window.
DROP TRIGGER IF EXISTS trg_tours_bookings_a2_set_hold ON public.tours_bookings;
CREATE TRIGGER trg_tours_bookings_a2_set_hold
  BEFORE INSERT OR UPDATE OF status, total_paid ON public.tours_bookings
  FOR EACH ROW EXECUTE FUNCTION public.tours_bookings_set_hold();

-- ------------------------------------------------------------------ 2. The sweep

/**
 * Cancel unpaid pending bookings whose hold ran out. Returns how many were freed.
 * Safe to call repeatedly: it only touches rows that are still overdue.
 */
CREATE OR REPLACE FUNCTION public.tours_expire_pending_holds(p_limit integer DEFAULT 500)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_ids uuid[];
  v_count integer;
BEGIN
  SELECT array_agg(id) INTO v_ids FROM (
    SELECT id FROM tours_bookings
     WHERE status = 'pending'
       AND hold_expires_at IS NOT NULL
       AND hold_expires_at < now()
       AND COALESCE(total_paid, 0) = 0
     ORDER BY hold_expires_at
     LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 500), 2000))
     FOR UPDATE SKIP LOCKED
  ) due;

  IF v_ids IS NULL THEN RETURN 0; END IF;

  -- A cancelled booking stops counting toward the date (tours_bookings_sync_capacity).
  UPDATE tours_bookings
     SET status = 'cancelled',
         cancellation_reason = 'Hold expired: not paid in time.',
         cancelled_at = now()
   WHERE id = ANY (v_ids);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.tours_expire_pending_holds(integer) FROM PUBLIC, anon, authenticated;
-- The sweep endpoint uses the secret key, which does not need an explicit grant.

/** What a tourist sees about their hold, for the payment page. */
CREATE OR REPLACE FUNCTION public.tours_booking_hold_left(p_booking_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE
    WHEN b.status <> 'pending' OR b.hold_expires_at IS NULL THEN NULL
    WHEN b.hold_expires_at <= now() THEN 'expired'
    WHEN b.hold_expires_at - now() < interval '1 hour'
      THEN 'less than an hour'
    ELSE to_char(b.hold_expires_at AT TIME ZONE 'Asia/Manila', 'FMHH12:MI AM')
  END
    FROM tours_bookings b
   WHERE b.id = p_booking_id;
$$;
REVOKE ALL ON FUNCTION public.tours_booking_hold_left(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tours_booking_hold_left(uuid) TO authenticated;
