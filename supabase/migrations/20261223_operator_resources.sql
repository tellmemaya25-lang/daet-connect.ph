-- Operator resources: capacity on what the operator actually owns, not on a package.
--
-- A package's capacity today is one number per date, so a 09:00 Calaguas tour and
-- a 14:00 island-hopping tour each sell 10 seats and the operator has one boat.
-- This adds the missing noun: a resource (a boat, a van, a driver, a guide team)
-- that a package consumes, and which therefore cannot be in two places at once.
--
-- 1. tours_operator_resources: what an operator owns. `seats` is how many guests
--    one unit carries; `units` is how many of them they own (2 boats = units 2).
-- 2. tours_package_resources: what a package consumes. `seats_per_pax` is how
--    many seats one guest takes (a seat on a boat = 1); `units_per_booking` is
--    how many units the tour takes whatever the group size (one van).
-- 3. A package with no rows in tours_package_resources keeps exactly today's
--    behaviour, so existing tours are untouched until operators fill this in.
-- 4. tours_claim_resources(): per day the tour occupies, take a lock and claim
--    the resource that has the seats and is free for that window. Claims are
--    stored per date in tours_booking_resource_claims, so cancelling frees that
--    day and the operator's board can name the boat.
--
-- Two tours may share a boat on one day when their hours don't overlap: the
-- arithmetic below only counts claims whose window overlaps the requested one.
--
-- Applied by hand in the Supabase SQL editor.

-- ------------------------------------------------------------------- 1. The fleet

CREATE TABLE IF NOT EXISTS public.tours_operator_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid NOT NULL REFERENCES public.tours_operators(id) ON DELETE CASCADE,
  kind text NOT NULL,
  name text NOT NULL,
  seats integer NOT NULL DEFAULT 0 CHECK (seats >= 0 AND seats <= 200),
  units integer NOT NULL DEFAULT 1 CHECK (units >= 1 AND units <= 50),
  note text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tours_operator_resources_kind_check
    CHECK (kind IN ('boat', 'van', 'car', 'tricycle', 'driver', 'guide_team')),
  CONSTRAINT tours_operator_resources_name_check CHECK (char_length(btrim(name)) BETWEEN 1 AND 80)
);

CREATE UNIQUE INDEX IF NOT EXISTS tours_operator_resources_name_key
  ON public.tours_operator_resources (operator_id, lower(btrim(name)));

ALTER TABLE public.tours_operator_resources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tours_operator_resources_select ON public.tours_operator_resources;
CREATE POLICY tours_operator_resources_select ON public.tours_operator_resources
  FOR SELECT TO authenticated
  USING (
    operator_id IN (SELECT id FROM public.tours_operators WHERE profile_id = auth.uid())
    OR get_my_role() = 'admin'
  );

DROP POLICY IF EXISTS tours_operator_resources_write ON public.tours_operator_resources;
CREATE POLICY tours_operator_resources_write ON public.tours_operator_resources
  FOR ALL TO authenticated
  USING (operator_id IN (SELECT id FROM public.tours_operators WHERE profile_id = auth.uid()))
  WITH CHECK (operator_id IN (SELECT id FROM public.tours_operators WHERE profile_id = auth.uid()));

DROP TRIGGER IF EXISTS trg_tours_operator_resources_updated_at ON public.tours_operator_resources;
CREATE TRIGGER trg_tours_operator_resources_updated_at
  BEFORE UPDATE ON public.tours_operator_resources
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ------------------------------------------------- 2. What a package consumes

CREATE TABLE IF NOT EXISTS public.tours_package_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES public.tours_packages(id) ON DELETE CASCADE,
  kind text NOT NULL,
  seats_per_pax integer NOT NULL DEFAULT 1 CHECK (seats_per_pax >= 0 AND seats_per_pax <= 10),
  units_per_booking integer NOT NULL DEFAULT 1 CHECK (units_per_booking >= 0 AND units_per_booking <= 10),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tours_package_resources_kind_check
    CHECK (kind IN ('boat', 'van', 'car', 'tricycle', 'driver', 'guide_team')),
  CONSTRAINT tours_package_resources_uses_something_check
    CHECK (seats_per_pax > 0 OR units_per_booking > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS tours_package_resources_key
  ON public.tours_package_resources (package_id, kind);

ALTER TABLE public.tours_package_resources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tours_package_resources_select ON public.tours_package_resources;
CREATE POLICY tours_package_resources_select ON public.tours_package_resources
  FOR SELECT TO authenticated
  USING (
    package_id IN (
      SELECT p.id FROM public.tours_packages p
        JOIN public.tours_operators o ON o.id = p.operator_id
       WHERE o.profile_id = auth.uid()
    )
    OR get_my_role() = 'admin'
  );

DROP POLICY IF EXISTS tours_package_resources_write ON public.tours_package_resources;
CREATE POLICY tours_package_resources_write ON public.tours_package_resources
  FOR ALL TO authenticated
  USING (package_id IN (
    SELECT p.id FROM public.tours_packages p
      JOIN public.tours_operators o ON o.id = p.operator_id
     WHERE o.profile_id = auth.uid()
  ))
  WITH CHECK (package_id IN (
    SELECT p.id FROM public.tours_packages p
      JOIN public.tours_operators o ON o.id = p.operator_id
     WHERE o.profile_id = auth.uid()
  ));

-- ------------------------------------------------------- 3. The claims ledger

CREATE TABLE IF NOT EXISTS public.tours_booking_resource_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.tours_bookings(id) ON DELETE CASCADE,
  resource_id uuid NOT NULL REFERENCES public.tours_operator_resources(id) ON DELETE CASCADE,
  claim_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tours_booking_resource_claims_key UNIQUE (booking_id, resource_id, claim_date)
);

CREATE INDEX IF NOT EXISTS tours_booking_resource_claims_due
  ON public.tours_booking_resource_claims (resource_id, claim_date);

ALTER TABLE public.tours_booking_resource_claims ENABLE ROW LEVEL SECURITY;

-- Readable by the booking's tourist, the operator and admins. Nobody writes
-- directly: the claim function below owns this table.
DROP POLICY IF EXISTS tours_booking_resource_claims_select ON public.tours_booking_resource_claims;
CREATE POLICY tours_booking_resource_claims_select ON public.tours_booking_resource_claims
  FOR SELECT TO authenticated
  USING (
    public.tours_is_booking_tourist(booking_id)
    OR public.tours_is_booking_operator(booking_id)
    OR get_my_role() = 'admin'
  );

-- ------------------------------------------------------------ 4. The arithmetic

/**
 * What is left of each resource of a kind, for one operator, on one date, in one
 * window.
 *
 * A resource runs one departure at a time: two tours may share a boat only if
 * their windows do not overlap, and `units` is how many departures can run at
 * once (2 boats = 2). Tourists on the *same* tour share one boat, and their
 * seats are already limited per date by tours_package_availability — so only a
 * *different* package overlapping this one takes a unit away. That is what stops
 * the 09:00 Calaguas trip and the 09:00 island-hopping trip claiming one boat.
 *
 * `seats_free` is the room on the resource for a single group, so a party
 * bigger than the boat is refused even when the boat is idle.
 */
CREATE OR REPLACE FUNCTION public.tours_resource_units_free(
  p_operator uuid, p_kind text, p_date date, p_window int4range, p_exclude_booking uuid, p_package uuid)
RETURNS TABLE (resource_id uuid, units_free integer, seats_free integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT r.id,
         GREATEST(0, r.units - COALESCE(t.tours_taken, 0))::int,
         r.seats::int
    FROM tours_operator_resources r
    LEFT JOIN LATERAL (
      SELECT count(DISTINCT b.package_id)::int AS tours_taken
        FROM tours_booking_resource_claims cl
        JOIN tours_bookings b
          ON b.id = cl.booking_id AND b.status IN ('pending', 'confirmed', 'completed')
       WHERE cl.resource_id = r.id
         AND cl.claim_date = p_date
         AND (p_exclude_booking IS NULL OR b.id <> p_exclude_booking)
         AND b.package_id <> p_package
         AND public.tours_booking_window(b.package_id, (p_date - b.tour_date) + 1) && p_window
    ) t ON true
   WHERE r.operator_id = p_operator AND r.kind = p_kind AND r.is_active
   ORDER BY r.sort_order, r.name, r.id;
$$;

-- --------------------------------------------------------------- 5. Claiming

/**
 * Claim every resource this booking needs on every day it occupies, or raise a
 * sentence the tourist can act on. Idempotent: it clears this booking's claims
 * and takes them again, so a date or group-size change re-checks cleanly.
 * A package with no declared needs claims nothing and keeps today's per-package
 * seat capacity.
 */
CREATE OR REPLACE FUNCTION public.tours_claim_resources(p_booking_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  b tours_bookings%ROWTYPE;
  v_operator uuid;
  v_requires record;
  v_day integer;
  v_span integer;
  v_claim_date date;
  v_window int4range;
  v_pick uuid;
  v_message text;
BEGIN
  SELECT * INTO b FROM tours_bookings WHERE id = p_booking_id;
  IF NOT FOUND OR b.status NOT IN ('pending', 'confirmed') THEN RETURN; END IF;

  IF NOT EXISTS (SELECT 1 FROM tours_package_resources WHERE package_id = b.package_id) THEN
    RETURN;
  END IF;

  SELECT operator_id INTO v_operator FROM tours_packages WHERE id = b.package_id;
  IF v_operator IS NULL THEN RETURN; END IF;

  -- Start from a clean slate so this is safe to re-run on a changed booking.
  DELETE FROM tours_booking_resource_claims WHERE booking_id = b.id;

  v_span := public.tours_package_span_days(b.package_id);

  FOR v_requires IN
    SELECT * FROM tours_package_resources WHERE package_id = b.package_id ORDER BY kind
  LOOP
    FOR v_day IN 1..v_span LOOP
      v_claim_date := b.tour_date + (v_day - 1);
      v_window := public.tours_booking_window(b.package_id, v_day);

      -- One resource of this kind at a time, across concurrent bookings.
      PERFORM pg_advisory_xact_lock(hashtextextended(
        'resource:' || v_operator::text || ':' || v_requires.kind || ':' || v_claim_date::text, 0));

      -- A different tour already on this resource in this window needs its own
      -- unit; a boat with room for the party is enough otherwise.
      SELECT f.resource_id INTO v_pick
        FROM public.tours_resource_units_free(
               v_operator, v_requires.kind, v_claim_date, v_window, b.id, b.package_id) f
       WHERE f.units_free >= v_requires.units_per_booking
         AND f.seats_free * v_requires.units_per_booking >= v_requires.seats_per_pax * b.number_of_pax
       LIMIT 1;

      IF v_pick IS NULL THEN
        IF v_day = 1 THEN
          v_message := format('No %s is free for this tour on %s. Choose another date or another time.',
                              replace(v_requires.kind, '_', ' '), to_char(v_claim_date, 'DD Mon'));
        ELSE
          v_message := format('The %s is out on a multi-day trip on %s, so this tour cannot start on that date. '
                              'Choose a start date after it returns, or ask the operator to add capacity.',
                              replace(v_requires.kind, '_', ' '), to_char(v_claim_date, 'DD Mon'));
        END IF;
        RAISE EXCEPTION '%', v_message
          USING ERRCODE = 'check_violation',
                HINT = 'Ask the operator to add capacity, or pick a date when the resource is back.';
      END IF;

      INSERT INTO tours_booking_resource_claims (booking_id, resource_id, claim_date)
      VALUES (b.id, v_pick, v_claim_date)
      ON CONFLICT (booking_id, resource_id, claim_date) DO NOTHING;
    END LOOP;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.tours_claim_resources(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.tours_bookings_resource_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.tours_claim_resources(NEW.id);
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.tours_bookings_resource_guard() FROM PUBLIC, anon, authenticated;

-- AFTER INSERT so the booking row exists for the claim's foreign key.
DROP TRIGGER IF EXISTS trg_tours_bookings_resource_claim ON public.tours_bookings;
CREATE TRIGGER trg_tours_bookings_resource_claim
  AFTER INSERT ON public.tours_bookings
  FOR EACH ROW EXECUTE FUNCTION public.tours_bookings_resource_guard();

/**
 * A booking that changes date or size must pass the resource check again; a
 * booking that stops being active hands its claims back.
 */
CREATE OR REPLACE FUNCTION public.tours_bookings_resource_refresh()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status NOT IN ('pending', 'confirmed') THEN
    DELETE FROM tours_booking_resource_claims WHERE booking_id = NEW.id;
    RETURN NULL;
  END IF;

  IF NEW.tour_date IS DISTINCT FROM OLD.tour_date
     OR NEW.number_of_pax IS DISTINCT FROM OLD.number_of_pax
     OR NEW.package_id IS DISTINCT FROM OLD.package_id THEN
    PERFORM public.tours_claim_resources(NEW.id);
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.tours_bookings_resource_refresh() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_tours_bookings_resource_refresh ON public.tours_bookings;
CREATE TRIGGER trg_tours_bookings_resource_refresh
  AFTER UPDATE OF status, tour_date, number_of_pax, package_id ON public.tours_bookings
  FOR EACH ROW EXECUTE FUNCTION public.tours_bookings_resource_refresh();

-- ------------------------------------------------------------------ 6. Grants

-- The operator maintains their own fleet and each tour's needs; the claims table
-- is written only by tours_claim_resources (SECURITY DEFINER), never directly.
REVOKE ALL ON TABLE public.tours_operator_resources FROM anon;
REVOKE ALL ON TABLE public.tours_package_resources FROM anon;
REVOKE ALL ON TABLE public.tours_booking_resource_claims FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tours_operator_resources TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tours_package_resources TO authenticated;
-- Read only: a tourist sees which boat they were promised, and no one can claim
-- one by hand and dodge the availability check.
GRANT SELECT ON TABLE public.tours_booking_resource_claims TO authenticated;

REVOKE ALL ON FUNCTION public.tours_resource_units_free(uuid, text, date, int4range, uuid, uuid) FROM PUBLIC, anon, authenticated;
