-- Auto-complete past bookings.
--
-- A confirmed booking stayed 'confirmed' until the operator marked it
-- completed, so finished trips kept showing as upcoming. This function moves
-- confirmed, fully paid bookings whose tour has ended (Manila time) to
-- 'completed'. Multi-day tours end on tour_date + (duration_value - 1) days.
--
-- Left alone on purpose, for the operator to settle by hand:
--   * unpaid or partly paid bookings (money still owed or to refund),
--   * trips that were called off.
--
-- A booking an update can't pass (e.g. an old row a newer check constraint
-- rejects) is skipped with a WARNING and stays for the operator.
--
-- Runs as the system (no auth.uid()), which tours_bookings_status_guard allows
-- for confirmed -> completed. tours_rewards_on_booking grants the usual
-- completion points. Safe to call any number of times, concurrently too.

CREATE OR REPLACE FUNCTION public.tours_complete_past_bookings(p_limit integer DEFAULT 500)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Manila')::date;
  v_id uuid;
  v_count integer := 0;
BEGIN
  FOR v_id IN
    SELECT b.id
      FROM tours_bookings b
      JOIN tours_packages p ON p.id = b.package_id
     WHERE b.status = 'confirmed'
       AND b.payment_status = 'paid'
       AND b.called_off_at IS NULL
       AND b.tour_date + CASE WHEN p.duration_type = 'days'
                              THEN GREATEST(COALESCE(p.duration_value, 1), 1)::int - 1
                              ELSE 0 END < v_today
     ORDER BY b.tour_date
     LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 500), 2000))
     FOR UPDATE OF b SKIP LOCKED
  LOOP
    -- One row at a time, so a row an older check rejects (or another trigger
    -- refuses) is skipped and logged instead of failing the whole batch.
    BEGIN
      UPDATE tours_bookings SET status = 'completed' WHERE id = v_id;
      v_count := v_count + 1;
    EXCEPTION WHEN others THEN
      RAISE WARNING 'tours_complete_past_bookings: skipped booking %: %', v_id, SQLERRM;
    END;
  END LOOP;

  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.tours_complete_past_bookings(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tours_complete_past_bookings(integer) TO service_role;
