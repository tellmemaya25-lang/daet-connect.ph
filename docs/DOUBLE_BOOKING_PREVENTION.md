# Avoiding double booking: tourists and operators

How to stop the same person, the same guide, or the same boat being booked twice.
Two problems share a name but need different answers: a **tourist** is blocked by
their own calendar (time), an **operator** is blocked by a shared resource
(a boat, a van, a guide) that is not a date.

Written 2026-11-19 after reading the booking path end to end and checking
production.

---

## 1. What "double booking" means here

| # | Kind | Who is hurt | Prevented today? |
|---|---|---|---|
| 1 | Same tourist books the same tour twice on a date | tourist (double charge) | **Yes** |
| 2 | Same tourist books two tours that **overlap in time** | tourist (can't be in two places) | **No** |
| 3 | Same guide is on two tours that overlap | guide, both tourists | Partly |
| 4 | Operator sells more seats/departures than they own | operator (no boat to send) | **No** |

## 2. What already works — don't rebuild it

The booking path is genuinely well defended. Credit where it is due:

- **Seats are counted by the database, never by the client.**
  `tours_count_booked_seats()` sums `number_of_pax` over
  `pending/confirmed/completed`; `trg_tours_bookings_sync_capacity` keeps
  `tours_package_availability.capacity_booked` in step. Operators may only write
  `capacity_total` (`20261026_f2_booking_integrity.sql`).
- **The last seat cannot be sold twice.** `tours_bookings_before_insert()` takes
  `SELECT … FOR UPDATE` on the date's availability row before comparing seats, so
  two concurrent bookings serialise.
- **Kind 1 (#1) is closed twice over.** A trigger raises a readable message and a
  partial unique index (`tours_bookings_one_active_per_tourist`) is the guard that
  still holds under concurrent inserts.
- **Guides are scheduled by the hour, not the day.**
  `tours_guide_busy_reason_for()` compares `int4range` windows, so a guide can run
  a 09:00–10:00 and a 14:00–16:00 tour on one day. Racing assignments are
  serialised by `pg_advisory_xact_lock` keyed on guide + date
  (`20261218_guide_hours_no_overlap.sql`).
- **Tour length already exists** as a function: `tours_package_window(package)`
  returns `int4range` minutes from midnight, mirrored in TypeScript by
  `tourWindow()` in `src/lib/tours/guide-hours.ts`.

**The machinery for time-based conflict detection is already built.** It is only
wired to guides. Kinds 2 and 4 are the gaps.

## 3. What is actually broken (checked against production)

### 3a. A tourist can book two tours at the same hour — live, right now

Production, tourist `cba442a6…`, both **confirmed**:

| Booking | Tour | Date | Time |
|---|---|---|---|
| `BK-20261113-77EA47` | Bagasbas Surf & Chill (8 h) | 2026-11-21 | **whole day** (no meeting time) |
| `BK-20261113-AC4B5D` | First Rizal Monument (1 h) | 2026-11-21 | **09:00–10:00** |

The second sits inside the first. The trigger only refuses the *same package* on
the same date (`20261202_no_double_booking.sql`), so the tourist paid for a tour
they cannot attend. Confirmed bookings are affected, not a hypothetical.

### 3b. Multi-day tours block one day, not their span

`tours_package_window()` returns `duration_value * 60` minutes **capped at one
day**: `LEAST(1440, …)`. So:

```
Calaguas camping, 2 days 1 night   → [0,1440)   (one day)
Calaguas camping, 3 days 2 nights  → [0,1440)   (one day, same as above)
```

The busy check matches on `b.tour_date = p_date` only. A guide booked on a
2-day Calaguas trip on 21 Nov is treated as **free on 22 Nov**, and the same for
`tours_guide_availability_guard` (which refuses narrowing hours). A guide can
therefore be assigned to a second tour mid-expedition, and the tourist can book
over the second day of their own trip.

### 3c. Operators have no capacity control at all

```
published packages ......... 13
packages with open dates .... 0
tours_package_availability .. 0 rows
```

Every tour is in "legacy mode": `tours_bookings_before_insert()` skips the seat
check entirely when a package has no availability rows (`IF NOT FOUND THEN IF
EXISTS (…) RAISE … END IF` — no else). So today an operator can take **unlimited
bookings on any date, at any time**, and nothing in the product warns them. Kind
4 is not a missing feature; it is the default state.

Seat capacity is also the wrong axis for an operator. `capacity_total` is per
**package per date**. A 09:00 Calaguas tour and a 14:00 island-hopping tour on the
same day draw on the **same boat**, and a 08:00 surf lesson and a 09:00 monument
walk draw on the **same van and driver** — but each package has its own
independent capacity number. Adding up to 10 seats to both still lets the operator
sell two boats they don't have, and sell 10 seats on the 09:00 tour and 10 on the
11:00 tour that overlap.

### 3d. Two smaller holes

- **Unpaid `pending` bookings never expire.** Nothing sweeps them, and they count
  toward `tours_count_booked_seats()`. A few abandoned carts can hold a date
  shut indefinitely.
- **`meeting_time` is often missing** (5 of 13 published packages). Without it a
  tour takes `[0,1440)` and the tourist's whole day is consumed. That is the safe
  default, but it makes "two short tours in one day" impossible to express until
  operators fill the field in.

---

## 4. Tourists: block by time allotment

The rule: **a tourist may not hold two active bookings whose time windows
overlap on the same day.** Reuse the guide's interval logic; add a travel buffer.

### 4a. Compute the window, per day, across the span

Extend `tourWindow()` / `tours_package_window()` so a multi-day tour yields a
window **per day it occupies**:

| Tour | Tour date | Windows |
|---|---|---|
| First Rizal Monument, 1 h, 09:00 | day 1 | `[540, 600)` |
| Bagasbas Surf, 8 h, no meeting time | day 1 | `[0, 1440)` |
| Calaguas camping, 2 d 1 n, 06:00 | day 1 | `[360, 1440)` |
| Calaguas camping, 2 d 1 n, 06:00 | **day 2** | `[0, 1440)` → until return time |

For a multi-day tour the last day runs until the return leg, not all day; store a
`return_time` on the package (or fall back to end of day).

### 4b. Add a transfer buffer

A tourist needs to get from the end of tour A to the start of tour B. Expand each
window by a configurable `TRANSFER_BUFFER_MIN` (recommend **45 min** inside Daet,
**90 min** when either tour leaves the mainland) and test the expanded windows.

This is what makes the rule humane rather than merely correct: back-to-back
09:00–10:00 and 10:00–11:00 in different towns is a booking nobody can honour.

### 4c. Enforce it in the database, not the form

Add the guard where the other guards live, so the assistant, the planner, the
booking form and any future surface all obey it:

```sql
CREATE OR REPLACE FUNCTION public.tours_tourist_busy_reason_for(
  p_user uuid, p_date date, p_package uuid, p_exclude uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH w AS (SELECT tours_package_window(p_package) AS win)
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM tours_bookings b, w
       WHERE b.user_id = p_user
         AND b.status IN ('pending','confirmed')
         AND (p_exclude IS NULL OR b.id <> p_exclude)
         AND tours_booking_occupied_dates(b.package_id, b.tour_date) @> p_date
         AND tours_window_with_buffer(tours_package_window(b.package_id))
             && tours_window_with_buffer(w.win))
    THEN 'overlaps_other_tour' ELSE NULL END;
$$;
```

Called from a `BEFORE INSERT` trigger on `tours_bookings`, after the existing
duplicate trigger, with the same `pg_advisory_xact_lock` on
`(tourist, date)` that `tours_bookings_no_duplicate()` already takes — so two
tabs cannot slip past it.

Readable message, in the voice of the rest of the app:

> **This tour is at the same time as First Jose Rizal Monument Historical Visit
> (09:00–10:00) on 21 Nov.** Pick another date, or cancel that booking first.

### 4d. Show it before they commit

The warning must appear in the booking form, not only on submit. On date
selection, load the tourist's active bookings for that date and render the clash
inline with the two windows and the buffer. The database stays the source of
truth; this is the courtesy.

### 4e. Behaviour to settle with the owner

- **Hard block or warn-and-allow?** Recommend **hard block** for overlap, because
  the tourist physically cannot attend. Keep an explicit "I know, these are for
  different people in my group" escape only if group splitting is a real use case
  — it currently is not (decision 19: one person books and pays for everyone).
- **What about `pending`?** Count it. An unpaid hold still occupies the slot.
  See 5d.

---

## 5. Operators: capacity on a shared resource, not a package

This is the harder design, because the operator's constraint is not "this tour"
but "this boat". The fix is to stop counting capacity per package and start
counting it per **resource**, with packages drawing on resources.

### 5a. The model

```
tours_operator_resources        -- what the operator actually owns
  id, operator_id, kind, name, seats, is_active
  kind ∈ boat | van | tricycle | guide_team | seats

tours_package_resources         -- what a tour consumes
  package_id, resource_kind, units_per_pax (or seats_required), units_per_booking
```

A boat with `seats = 12` and a package needing 1 seat per pax gives that tour 12
seats **when the boat is free**. A van shared by three short tours gives 1 unit
per booking; the 09:00 and 11:00 tours compete for it and cannot overlap.

### 5b. Why this fixes the case the current model can't

Two packages, same operator, same day, same boat:

| | Today | With resources |
|---|---|---|
| 09:00 Calaguas day tour, 10 pax | separate capacity, both sellable | claims the boat 06:00–18:00 |
| 14:00 Island hopping, 10 pax | separate capacity, both sellable | **refused** — boat is out |

And it degrades gracefully: a package with no resource rows falls back to today's
per-package seat capacity, so existing tours keep working while operators fill in
their fleet.

### 5c. Enforce at insert, per occupied day

```
for each day the tour occupies:
    for each required resource kind:
        lock  pg_advisory_xact_lock('resource:' || operator || kind || day)
        pick  an active resource of that kind that is free for the window
              and has seats >= pax
        if none → RAISE 'no_boat_that_day' / 'no_van_at_that_time'
        record the chosen resource on the booking (booking_resources)
```

Recording *which* resource was taken matters for two reasons: the operator's
board can show "Boat 2 / Van 1" against each booking, and a cancellation frees
that specific boat rather than decrementing a number.

For the **whole-day** resources (a boat out on a 2-day Calaguas trip) the same
occupied-dates expansion from 4a applies — this is the same bug as 3b, seen from
the operator's side.

### 5d. Release the hold: expire unpaid `pending`

A pending booking must not hold a boat forever.

- Add `hold_expires_at` (default `now() + 2 h`, configurable per package).
- A scheduled function (`tours_expire_pending_holds()`, called from a Vercel cron
  every 15 min) moves overdue, unpaid `pending` bookings to `cancelled` with
  `cancellation_reason = 'hold_expired'`.
- Show the countdown on the payment page: "Your seats are held until 14:35."

Without this, every guard above is a way for one abandoned cart to shut a date.

### 5e. Operator-facing surfaces this enables

- **Day board by resource**, not by package: rows are boats/vans/guides, columns
  are the day's hours. Overbooking becomes visually impossible to author.
- **Sell-out warning at the edit screen**: lowering `capacity_total` below booked
  seats is already refused; extend it to resources ("Boat 1 already has 8 of 12
  seats on 21 Nov").
- **Auto-assign a guide** already exists (`tours_pick_guide`); auto-assign a
  vehicle/boat with the same shape, using the same busy-reason function.

---

## 6. Phased plan

Each phase ships value alone and is independently testable.

| Phase | Work | Kills | Effort |
|---|---|---|---|
| **0** | Sweep unpaid `pending` holds + `hold_expires_at` + countdown | 3d | S |
| **1** | Tourist overlap: occupied-dates + buffer + DB trigger + inline warning | **2 (#2, live)** | M |
| **2** | Multi-day span: real per-day windows for guides and tourists, `return_time` | 3b | M |
| **3** | Operator resources: tables, insert guard, assignment recorded | **4 (#4)** | L |
| **4** | Resource day board + sell-out warnings + auto-assign vehicle | polish | M |

Phase 1 and 2 use only what exists (`tours_package_window`, `int4range` overlap,
advisory locks). Phase 3 is the only one that needs new tables.

### Acceptance criteria

- **Phase 1** — booking a 09:00–10:00 tour when an 8 h tour is already confirmed
  on that date is refused in the database *and* flagged in the form; two
  non-overlapping short tours the same day still succeed; the buffer blocks
  10:00-after-10:00 in different towns.
- **Phase 2** — a guide on a 2-day Calaguas trip starting 21 Nov is busy on the
  22nd; that guide does not appear in the picker for 22 Nov; the tourist cannot
  book over their own trip's second day.
- **Phase 3** — two overlapping tours needing the same boat cannot both be
  confirmed; the second gets `no_boat_that_day`; the boat's name shows on both
  bookings; cancelling one frees it for the other.

### Test strategy

The pure functions (`tourWindow`, a new `occupiedDates`, `windowsOverlap` with
buffer) belong in `guide-hours.ts` / a new `booking-windows.ts` with unit tests
next to the existing `guide-hours.test.ts`. The SQL rules get integration tests
in the style of `update-package-rpc.test.ts`, plus a concurrency test that fires
two inserts at once and asserts exactly one wins — the pattern already used for
the last-seat race.

---

## 7. Decisions needed from the owner

1. **Transfer buffer** — 45 min within Daet, 90 min cross-town: right numbers?
2. **Hard block vs warn** on tourist overlap (recommend hard block).
3. **Does a group ever split across two tours at once?** If yes, Phase 1 needs a
   per-booking "attending guests" concept; if no, hard block is safe.
4. **Hold window** for unpaid pending bookings — 2 hours, or until the end of the
   day?
5. **Resources**: do operators want to name individual boats/vans, or is a simple
   count per kind ("I have 2 boats") enough? The count is much less work and
   prevents the overbooking in 5b; naming them is what enables the day board.
