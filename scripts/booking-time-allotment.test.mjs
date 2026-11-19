// Real Postgres (pglite) checks for the time-allotment rule, the hold sweep and
// the operator resource claim. Run with: npm run test:scripts
//
// The migrations are applied by hand in the Supabase SQL editor, so these tests
// build the smallest schema they depend on and then apply the migration file
// itself — the same file that gets pasted, so a syntax or logic slip fails here.

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const read = (name) => readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8");
const allotment = await read("20261221_booking_time_allotment.sql");
const holds = await read("20261222_booking_holds.sql");
const resources = await read("20261223_operator_resources.sql");

const USER = "30000000-0000-4000-8000-000000000001";
const OTHER_USER = "30000000-0000-4000-8000-000000000002";
const OPERATOR = "40000000-0000-4000-8000-000000000001";
const OTHER_OPERATOR = "40000000-0000-4000-8000-000000000002";
const GUIDE = "50000000-0000-4000-8000-000000000001";
// Separate tourists, so a resource test fails on the resource rule and not on
// the tourist's own calendar.
const U = (n) => `60000000-0000-4000-8000-00000000000${n}`;

/** The parts of the schema these migrations touch, as production has them. */
const SCHEMA = `
  CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '${USER}'::uuid $$;
  CREATE FUNCTION public.get_my_role() RETURNS text LANGUAGE sql AS $$ SELECT 'tourist'::text $$;
  CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
  CREATE FUNCTION public.tours_is_booking_tourist(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
  CREATE FUNCTION public.tours_is_booking_operator(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
  CREATE FUNCTION public.tours_guide_works_for(uuid, uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;

  CREATE TYPE duration_type AS ENUM ('hours', 'days');
  CREATE TYPE package_status AS ENUM ('draft', 'published', 'rejected');

  CREATE TABLE public.tours_operators (
    id uuid PRIMARY KEY, profile_id uuid, business_name text, accreditation_status text DEFAULT 'approved'
  );
  CREATE TABLE public.tours_packages (
    id uuid PRIMARY KEY, operator_id uuid REFERENCES public.tours_operators(id),
    title text, status package_status DEFAULT 'published',
    duration_type duration_type DEFAULT 'hours', duration_value integer DEFAULT 1,
    meeting_time time, municipality text
  );
  CREATE TABLE public.tours_guides (
    id uuid PRIMARY KEY, accreditation_status text DEFAULT 'approved', created_at timestamptz DEFAULT now()
  );
  CREATE TABLE public.tours_guide_availability (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), guide_id uuid, available_date date,
    is_available boolean DEFAULT true, start_time time, end_time time
  );
  CREATE TABLE public.tours_guide_ratings (guide_id uuid, average_rating numeric, review_count integer);
  CREATE TABLE public.tours_package_guides (package_id uuid, guide_id uuid, priority integer, is_active boolean);

  CREATE TABLE public.tours_package_availability (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), package_id uuid, available_date date,
    capacity_total integer DEFAULT 10, capacity_booked integer DEFAULT 0
  );

  CREATE TABLE public.tours_bookings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid, package_id uuid REFERENCES public.tours_packages(id),
    tour_date date, number_of_pax integer DEFAULT 1,
    status text DEFAULT 'pending', total_paid numeric DEFAULT 0,
    cancellation_reason text, cancelled_at timestamptz,
    assigned_guide_id uuid, proposed_guide_id uuid, guide_proposal_status text,
    created_at timestamptz DEFAULT now()
  );

  -- The parts of 20261209/20261218 the new rules build on, verbatim in behaviour.
  CREATE FUNCTION public.tours_package_window(p_package uuid) RETURNS int4range
  LANGUAGE sql STABLE AS $$
    SELECT COALESCE((
      SELECT int4range((extract(epoch FROM p.meeting_time) / 60)::int,
                       LEAST(1440, (extract(epoch FROM p.meeting_time) / 60)::int
                                   + GREATEST(1, ceil(p.duration_value * 60))::int))
        FROM tours_packages p
       WHERE p.id = p_package AND p.duration_type = 'hours'
         AND p.meeting_time IS NOT NULL AND p.duration_value > 0
    ), int4range(0, 1440));
  $$;
  CREATE FUNCTION public.tours_availability_window(p_start time, p_end time) RETURNS int4range
  LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE WHEN p_start IS NULL OR p_end IS NULL THEN int4range(0, 1440)
                ELSE int4range((extract(epoch FROM p_start) / 60)::int,
                               (extract(epoch FROM p_end) / 60)::int) END;
  $$;
`;

async function db() {
  const d = new PGlite();
  await d.exec(SCHEMA);
  await d.query("INSERT INTO tours_operators (id, business_name) VALUES ($1,'Kalmado')", [OPERATOR]);
  return d;
}

async function tourId(d, kind, hours, meeting) {
  const { rows } = await d.query(
    `INSERT INTO tours_packages (id, operator_id, title, duration_type, duration_value, meeting_time)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5) RETURNING id`,
    [OPERATOR, `${kind} ${hours} ${meeting}`, kind, hours, meeting],
  );
  return rows[0].id;
}

async function book(d, pkg, date, { user = USER, pax = 2, status = "pending" } = {}) {
  const { rows } = await d.query(
    `INSERT INTO tours_bookings (user_id, package_id, tour_date, number_of_pax, status)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [user, pkg, date, pax, status],
  );
  return rows[0].id;
}

// ------------------------------------------------------------------ allotment

test("allotment: a multi-day trip occupies its whole span, not one day", async () => {
  const d = await db();
  try {
    await d.exec(allotment);
    const trip = await tourId(d, "days", 3, "06:00");
    const { rows } = await d.query(
      `SELECT tours_package_span_days($1) AS days,
              tours_occupied_dates($1, '2026-11-21'::date)::text AS span,
              tours_window_text(tours_booking_window($1, 1)) AS day1,
              tours_window_text(tours_booking_window($1, 2)) AS day2`,
      [trip],
    );
    assert.deepEqual(rows[0], { days: 3, span: "[2026-11-21,2026-11-24)", day1: "6:00 AM – midnight", day2: "all day" });
  } finally {
    await d.close();
  }
});

test("allotment: a tourist cannot book a tour inside one already paid for", async () => {
  const d = await db();
  try {
    await d.exec(allotment);
    const surf = await tourId(d, "hours", 8, null); // no meeting time: whole day
    const walk = await tourId(d, "hours", 1, "09:00");
    await book(d, surf, "2026-11-21", { status: "confirmed" });

    await assert.rejects(book(d, walk, "2026-11-21"), /overlaps your booking/);
    // The same walk on a free day is fine.
    await book(d, walk, "2026-11-22");
  } finally {
    await d.close();
  }
});

test("allotment: two short tours the same day are allowed when they are far enough apart", async () => {
  const d = await db();
  try {
    await d.exec(allotment);
    const morning = await tourId(d, "hours", 1, "09:00");
    const afternoon = await tourId(d, "hours", 1, "14:00");
    await book(d, morning, "2026-11-21", { status: "confirmed" });
    await book(d, afternoon, "2026-11-21");
  } finally {
    await d.close();
  }
});

test("allotment: the 45-minute transfer buffer blocks back-to-back tours", async () => {
  const d = await db();
  try {
    await d.exec(allotment);
    const first = await tourId(d, "hours", 1, "09:00"); // 9:00-10:00
    const next = await tourId(d, "hours", 1, "10:00");
    await book(d, first, "2026-11-21", { status: "confirmed" });
    await assert.rejects(book(d, next, "2026-11-21"), /overlaps your booking/);

    const later = await tourId(d, "hours", 1, "11:00"); // clear of the buffer
    await book(d, later, "2026-11-21");
  } finally {
    await d.close();
  }
});

test("allotment: a new multi-day trip runs into a tour booked later in the week", async () => {
  const d = await db();
  try {
    await d.exec(allotment);
    const trip = await tourId(d, "days", 3, "06:00");
    const walk = await tourId(d, "hours", 1, "09:00");
    await book(d, walk, "2026-11-22", { status: "confirmed" });
    // The trip starts on the 21st and holds the 21st-23rd, so the 22nd clashes.
    await assert.rejects(book(d, trip, "2026-11-21"), /overlaps your booking/);
    // Starting on the 24th is clear.
    await book(d, trip, "2026-11-24");
  } finally {
    await d.close();
  }
});

test("allotment: an existing multi-day trip blocks a tour on its second day", async () => {
  const d = await db();
  try {
    await d.exec(allotment);
    const trip = await tourId(d, "days", 3, "06:00");
    const walk = await tourId(d, "hours", 1, "09:00");
    await book(d, trip, "2026-11-21", { status: "confirmed" });
    await assert.rejects(book(d, walk, "2026-11-22"), /overlaps your booking/);
    await book(d, walk, "2026-11-25");
  } finally {
    await d.close();
  }
});

test("allotment: cancelled bookings do not block, and another tourist is unaffected", async () => {
  const d = await db();
  try {
    await d.exec(allotment);
    const surf = await tourId(d, "hours", 8, null);
    const walk = await tourId(d, "hours", 1, "09:00");
    await book(d, surf, "2026-11-21", { status: "cancelled" });
    await book(d, walk, "2026-11-21");

    const trip = await tourId(d, "hours", 8, null);
    await book(d, trip, "2026-11-25", { status: "confirmed" });
    await book(d, walk, "2026-11-25", { user: OTHER_USER });
  } finally {
    await d.close();
  }
});

test("allotment: guides are busy for every day of a multi-day trip", async () => {
  const d = await db();
  try {
    await d.exec(allotment);
    await d.query("INSERT INTO tours_guides (id) VALUES ($1)", [GUIDE]);
    const trip = await tourId(d, "days", 3, "06:00");
    const walk = await tourId(d, "hours", 1, "09:00");
    // Available every day, all day.
    for (const day of ["2026-11-21", "2026-11-22", "2026-11-23", "2026-11-24", "2026-11-25"]) {
      await d.query(
        "INSERT INTO tours_guide_availability (guide_id, available_date, is_available) VALUES ($1,$2,true)",
        [GUIDE, day],
      );
    }
    await d.query("UPDATE tours_bookings SET assigned_guide_id = $1 WHERE id = $2", [
      GUIDE,
      await book(d, trip, "2026-11-21", { status: "confirmed" }),
    ]);

    const busy = await d.query("SELECT tours_guide_busy_reason_for($1, $2::date, $3, NULL) AS r", [GUIDE, "2026-11-22", walk]);
    assert.equal(busy.rows[0].r, "already_booked");

    // The last day of the trip is the 23rd, so the 24th is free.
    const free = await d.query("SELECT tours_guide_busy_reason_for($1, $2::date, $3, NULL) AS r", [GUIDE, "2026-11-24", walk]);
    assert.equal(free.rows[0].r, null);
  } finally {
    await d.close();
  }
});

test("allotment: a guide must be available on every day a multi-day trip takes", async () => {
  const d = await db();
  try {
    await d.exec(allotment);
    await d.query("INSERT INTO tours_guides (id) VALUES ($1)", [GUIDE]);
    const trip = await tourId(d, "days", 3, "06:00");
    // Available on the first day only.
    await d.query("INSERT INTO tours_guide_availability (guide_id, available_date, is_available) VALUES ($1,'2026-11-21',true)", [GUIDE]);

    const r = await d.query("SELECT tours_guide_busy_reason_for($1, '2026-11-21'::date, $2, NULL) AS r", [GUIDE, trip]);
    assert.equal(r.rows[0].r, "not_available");
  } finally {
    await d.close();
  }
});

// ---------------------------------------------------------------------- holds

test("holds: an unpaid booking expires and frees the date; a paid one never does", async () => {
  const d = await db();
  try {
    await d.exec(holds);
    const pkg = await tourId(d, "hours", 4, "08:00");
    await d.query("UPDATE tours_packages SET hold_minutes = 120 WHERE id = $1", [pkg]);

    const unpaid = await book(d, pkg, "2026-11-21");
    const { rows } = await d.query("SELECT hold_expires_at IS NOT NULL AS set FROM tours_bookings WHERE id = $1", [unpaid]);
    assert.equal(rows[0].set, true);

    // Push it past its hold, then sweep.
    await d.query("UPDATE tours_bookings SET hold_expires_at = now() - interval '1 minute' WHERE id = $1", [unpaid]);
    const swept = await d.query("SELECT tours_expire_pending_holds() AS n");
    assert.equal(swept.rows[0].n, 1);
    const after = await d.query("SELECT status, cancellation_reason FROM tours_bookings WHERE id = $1", [unpaid]);
    assert.equal(after.rows[0].status, "cancelled");
    assert.match(after.rows[0].cancellation_reason, /Hold expired/);

    // Sweeping again changes nothing.
    assert.equal((await d.query("SELECT tours_expire_pending_holds() AS n")).rows[0].n, 0);
  } finally {
    await d.close();
  }
});

test("holds: packages without a hold window keep their pending bookings", async () => {
  const d = await db();
  try {
    await d.exec(holds);
    const pkg = await tourId(d, "hours", 4, "08:00"); // hold_minutes defaults to 0
    const id = await book(d, pkg, "2026-11-21");
    const { rows } = await d.query("SELECT hold_expires_at FROM tours_bookings WHERE id = $1", [id]);
    assert.equal(rows[0].hold_expires_at, null);
    assert.equal((await d.query("SELECT tours_expire_pending_holds() AS n")).rows[0].n, 0);
  } finally {
    await d.close();
  }
});

// ------------------------------------------------------------------ resources

test("resources: one boat cannot be on two tours at the same time", async () => {
  const d = await db();
  try {
    await d.exec(allotment);
    await d.exec(resources);
    await d.query(
      "INSERT INTO tours_operator_resources (operator_id, kind, name, seats, units) VALUES ($1,'boat','Boat 1',12,1)",
      [OPERATOR],
    );
    const morning = await tourId(d, "hours", 4, "08:00");
    const overlapping = await tourId(d, "hours", 4, "09:00");
    for (const pkg of [morning, overlapping]) {
      await d.query("INSERT INTO tours_package_resources (package_id, kind, seats_per_pax) VALUES ($1,'boat',1)", [pkg]);
    }

    await book(d, morning, "2026-11-21", { pax: 6, user: U(1) });
    await assert.rejects(book(d, overlapping, "2026-11-21", { pax: 6, user: U(2) }), /No boat is free/);
  } finally {
    await d.close();
  }
});

test("resources: the same boat can do two tours that do not overlap", async () => {
  const d = await db();
  try {
    await d.exec(allotment);
    await d.exec(resources);
    await d.query("INSERT INTO tours_operator_resources (operator_id, kind, name, seats, units) VALUES ($1,'boat','Boat 1',12,1)", [OPERATOR]);
    const morning = await tourId(d, "hours", 2, "08:00"); // 8:00-10:00
    const afternoon = await tourId(d, "hours", 2, "14:00");
    for (const pkg of [morning, afternoon]) {
      await d.query("INSERT INTO tours_package_resources (package_id, kind, seats_per_pax) VALUES ($1,'boat',1)", [pkg]);
    }
    await book(d, morning, "2026-11-21", { pax: 6, user: U(1) });
    await book(d, afternoon, "2026-11-21", { pax: 6, user: U(2) });
    const claims = await d.query("SELECT count(*)::int AS n FROM tours_booking_resource_claims");
    assert.equal(claims.rows[0].n, 2);
  } finally {
    await d.close();
  }
});

test("resources: a party bigger than the boat is refused", async () => {
  const d = await db();
  try {
    await d.exec(allotment);
    await d.exec(resources);
    await d.query("INSERT INTO tours_operator_resources (operator_id, kind, name, seats, units) VALUES ($1,'boat','Boat 1',10,1)", [OPERATOR]);
    const pkg = await tourId(d, "hours", 4, "08:00");
    await d.query("INSERT INTO tours_package_resources (package_id, kind, seats_per_pax) VALUES ($1,'boat',1)", [pkg]);

    // Tourists on the same tour share the boat, but only 10 fit on it. (Seats
    // per date are tours_package_availability's job; this is the boat's limit.)
    await assert.rejects(book(d, pkg, "2026-11-21", { pax: 11, user: U(1) }), /No boat is free/);
    await book(d, pkg, "2026-11-21", { pax: 10, user: U(1) });
    await book(d, pkg, "2026-11-21", { pax: 4, user: U(2) });
  } finally {
    await d.close();
  }
});

test("resources: cancelling frees the boat for that day", async () => {
  const d = await db();
  try {
    await d.exec(allotment);
    await d.exec(resources);
    await d.query("INSERT INTO tours_operator_resources (operator_id, kind, name, seats, units) VALUES ($1,'boat','Boat 1',12,1)", [OPERATOR]);
    const first = await tourId(d, "hours", 4, "08:00");
    const second = await tourId(d, "hours", 4, "09:00");
    for (const pkg of [first, second]) {
      await d.query("INSERT INTO tours_package_resources (package_id, kind, seats_per_pax) VALUES ($1,'boat',1)", [pkg]);
    }
    const held = await book(d, first, "2026-11-21", { pax: 6, user: U(1) });
    await assert.rejects(book(d, second, "2026-11-21", { pax: 6, user: U(2) }), /No boat is free/);

    await d.query("UPDATE tours_bookings SET status = 'cancelled' WHERE id = $1", [held]);
    await book(d, second, "2026-11-21", { pax: 6, user: U(2) });
  } finally {
    await d.close();
  }
});

test("resources: a boat on a multi-day trip is out for every day of it", async () => {
  const d = await db();
  try {
    await d.exec(allotment);
    await d.exec(resources);
    await d.query("INSERT INTO tours_operator_resources (operator_id, kind, name, seats, units) VALUES ($1,'boat','Boat 1',12,1)", [OPERATOR]);
    const trip = await tourId(d, "days", 3, "06:00");
    const dayTrip = await tourId(d, "hours", 4, "08:00");
    for (const pkg of [trip, dayTrip]) {
      await d.query("INSERT INTO tours_package_resources (package_id, kind, seats_per_pax) VALUES ($1,'boat',1)", [pkg]);
    }
    await book(d, trip, "2026-11-21", { pax: 6, user: U(1) });
    // The 22nd is the boat's second day out, so a day tour there finds nothing free.
    await assert.rejects(book(d, dayTrip, "2026-11-22", { pax: 4, user: U(2) }), /No boat is free/);
    // Back on the 24th, the trip is over.
    await book(d, dayTrip, "2026-11-24", { pax: 4, user: U(2) });
  } finally {
    await d.close();
  }
});

test("resources: a new multi-day trip cannot start when the boat is out on its second day", async () => {
  const d = await db();
  try {
    await d.exec(allotment);
    await d.exec(resources);
    await d.query("INSERT INTO tours_operator_resources (operator_id, kind, name, seats, units) VALUES ($1,'boat','Boat 1',12,1)", [OPERATOR]);
    const longTrip = await tourId(d, "days", 3, "06:00");   // holds 23rd-25th from the 23rd
    const newTrip = await tourId(d, "days", 3, "06:00");    // would hold 21st-23rd
    for (const pkg of [longTrip, newTrip]) {
      await d.query("INSERT INTO tours_package_resources (package_id, kind, seats_per_pax) VALUES ($1,'boat',1)", [pkg]);
    }
    await book(d, longTrip, "2026-11-23", { pax: 6, user: U(1) });
    // Day 1 (the 21st) is clear; day 3 (the 23rd) is not, so the trip is refused.
    await assert.rejects(book(d, newTrip, "2026-11-21", { pax: 4, user: U(2) }), /multi-day trip on 23 Nov/);
    // One day earlier it fits: 20th-22nd never reaches the 23rd.
    await book(d, newTrip, "2026-11-20", { pax: 4, user: U(2) });
  } finally {
    await d.close();
  }
});

test("resources: two boats mean two tours at once", async () => {
  const d = await db();
  try {
    await d.exec(allotment);
    await d.exec(resources);
    await d.query("INSERT INTO tours_operator_resources (operator_id, kind, name, seats, units) VALUES ($1,'boat','Boats',12,2)", [OPERATOR]);
    const first = await tourId(d, "hours", 4, "08:00");
    const second = await tourId(d, "hours", 4, "09:00");
    for (const pkg of [first, second]) {
      await d.query("INSERT INTO tours_package_resources (package_id, kind, seats_per_pax) VALUES ($1,'boat',1)", [pkg]);
    }
    await book(d, first, "2026-11-21", { pax: 6, user: U(1) });
    await book(d, second, "2026-11-21", { pax: 6, user: U(2) });
  } finally {
    await d.close();
  }
});

test("resources: another operator's boat is never taken", async () => {
  const d = await db();
  try {
    await d.exec(allotment);
    await d.exec(resources);
    await d.query("INSERT INTO tours_operators (id, business_name) VALUES ($1,'Daet Tours')", [OTHER_OPERATOR]);
    await d.query("INSERT INTO tours_operator_resources (operator_id, kind, name, seats, units) VALUES ($1,'boat','Boat 1',12,1)", [OPERATOR]);
    const theirs = await d.query(
      `INSERT INTO tours_packages (id, operator_id, title, duration_type, duration_value, meeting_time)
       VALUES (gen_random_uuid(), $1, 'Theirs', 'hours', 4, '08:00') RETURNING id`,
      [OTHER_OPERATOR],
    );
    const mineFirst = await tourId(d, "hours", 4, "08:00");
    const mineSecond = await tourId(d, "hours", 4, "09:00");
    for (const pkg of [mineFirst, mineSecond]) {
      await d.query("INSERT INTO tours_package_resources (package_id, kind, seats_per_pax) VALUES ($1,'boat',1)", [pkg]);
    }
    await book(d, mineFirst, "2026-11-21", { pax: 6, user: U(1) });
    // The other operator has no boat rows, so it keeps today's behaviour.
    await book(d, theirs.rows[0].id, "2026-11-21", { pax: 6, user: U(3) });
    await assert.rejects(book(d, mineSecond, "2026-11-21", { pax: 6, user: U(2) }), /No boat is free/);
  } finally {
    await d.close();
  }
});

test("resources: a package with no declared needs keeps the old seat behaviour", async () => {
  const d = await db();
  try {
    await d.exec(allotment);
    await d.exec(resources);
    const pkg = await tourId(d, "hours", 4, "08:00");
    const overlapping = await tourId(d, "hours", 4, "09:00");
    await book(d, pkg, "2026-11-21", { pax: 6, user: U(1) });
    await book(d, overlapping, "2026-11-21", { pax: 6, user: U(2) });
    assert.equal((await d.query("SELECT count(*)::int AS n FROM tours_booking_resource_claims")).rows[0].n, 0);
  } finally {
    await d.close();
  }
});
