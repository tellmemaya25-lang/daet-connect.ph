# Avoiding double booking: tourists and operators

How to stop the same person, the same guide, or the same boat being booked twice.
Two problems share a name but need different answers: a **tourist** is blocked by
their own calendar (time), an **operator** is blocked by a shared resource
(a boat, a van, a guide) that is not a date.

Written 2026-11-19 after reading the booking path end to end and checking
production.

---

## 1. What "double booking" means here

Status as of 2026-11-19, after implementation. Migrations are written but applied
by hand in the Supabase SQL editor — see §8.

| # | Kind | Who is hurt | Before | Now |
|---|---|---|---|---|
| 1 | Same tourist books the same tour twice on a date | tourist (double charge) | **Yes** | Yes |
| 2 | Same tourist books two tours that **overlap in time** | tourist (can't be in two places) | **No** | **Yes** |
| 3 | Same guide is on two tours that overlap | guide, both tourists | Partly | **Yes** (span-aware) |
| 4 | Operator sells more departures than they own | operator (no boat to send) | **No** | **Yes**, once the fleet is filled in |
| 5 | Abandoned unpaid booking holds a date shut | everyone | **No** | **Yes** (opt-in hold window) |

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
| Calaguas camping, 2 d 1 n, 06:00 | **day 2** | `[0, 1440)` — held whole |

No `return_time` was added: a package has no return leg to read, so every day
after the first is held whole. That is conservative — it may refuse a 16:00 tour
the day a camping trip gets back — but it never double books, and it needs no new
column. Add `return_time` if operators ask for the looser rule.

### 4b. Add a transfer buffer

A tourist needs to get from the end of tour A to the start of tour B. Widen one
window by `TRANSFER_BUFFER_MIN` (**45 min**) and test against the plain other one.
One side only: widening both would demand 90 minutes between tours.

This is what makes the rule humane rather than merely correct: back-to-back
09:00–10:00 and 10:00–11:00 in different towns is a booking nobody can honour.

### 4c. Enforce it in the database, not the form

Add the guard where the other guards live, so the assistant, the planner, the
booking form and any future surface all obey it:

`tours_tourist_busy_reason_for(user, date, package, exclude)` returns the
sentence to show, or NULL when the booking is fine. It checks **both
directions**: an existing multi-day trip may already cover the chosen date, and a
new multi-day trip may run into a tour booked later in the week. The overlap is
tested on the first day both bookings are running.

It is called from `trg_tours_bookings_b_zz_tourist_time`, a `BEFORE INSERT`
trigger ordered after the duplicate check and before pricing, taking
`pg_advisory_xact_lock('tourist_day:' || user || date)` so two tabs cannot both
pass.

The message is raised as-is:

> **This tour overlaps your booking for Bagasbas Beach Surf & Chill (all day) on
> 21 Nov.** Pick another date, or cancel that booking first.

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
  id, operator_id, kind, name, seats, units, note, is_active
  kind ∈ boat | van | car | tricycle | driver | guide_team
  seats = what one unit carries; units = how many they have

tours_package_resources         -- what a tour consumes
  package_id, kind, seats_per_pax, units_per_booking

tours_booking_resource_claims   -- the promise, per booking per day
  booking_id, resource_id, claim_date
```

A boat with `seats = 12` gives a tour 12 seats **when the boat is free**. A van
shared by short tours gives 1 unit per booking; the 09:00 and 11:00 tours compete
for it and cannot overlap.

The claims table is what makes the promise concrete: a cancellation frees the
specific boat for that date, and the operator's board can name it.

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
        pick  an active resource that is free for the window and has seats >= pax
        if none → RAISE 'No boat is free for this tour on 21 Nov...'
        record the claim (booking_id, resource_id, day)
```

Two details decide whether this is right:

- **A resource runs one departure at a time.** Two *different* packages
  overlapping need separate units. Tourists on the *same* package share one
  boat, and their seats are already capped per date by
  `tours_package_availability` — so only a different package takes a unit away.

Recording *which* resource was taken matters for two reasons: the operator's
board can show "Boat 2 / Van 1" against each booking, and a cancellation frees
that specific boat rather than decrementing a number.

For the **whole-day** resources (a boat out on a 2-day Calaguas trip) the same
occupied-dates expansion from 4a applies — this is the same bug as 3b, seen from
the operator's side.

### 5d. Release the hold: expire unpaid `pending`

A pending booking must not hold a boat forever.

- Add `hold_expires_at` (default `now() + 2 h`, configurable per package).
- A database function (`tours_expire_pending_holds()`) moves overdue, unpaid
  `pending` bookings to `cancelled`. It is called from the booking page as it is
  visited (throttled to once every 5 minutes, one run at a time) and from
  `/api/cron/booking-holds`, which any scheduler can call with `CRON_SECRET`.
  It is safe to call anywhere, any time: it only touches genuinely overdue rows.
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

## 6. What was built

Four migrations, two TypeScript modules, three pages and a cron endpoint.

| Phase | Built | Kills | Tests |
|---|---|---|---|
| **0** | `hold_expires_at`, `tours_packages.hold_minutes`, `tours_expire_pending_holds()`, in-app sweep + `/api/cron/booking-holds` | 3d | 2 + 6 |
| **1** | `tours_tourist_busy_reason_for()`, `trg_tours_bookings_b_zz_tourist_time`, inline form warning | **#2** | 8 + 18 |
| **2** | `tours_booking_window`, `tours_occupied_dates`, span-aware guide rule, picker and hours guard | 3b, #3 | 4 |
| **3** | 3 tables, `tours_claim_resources()`, claim ledger, fleet + per-tour pages | **#4** | 6 + 10 |
| **4** | Not built — the day board is the polish step, see §7 | — | — |

### Files

- `supabase/migrations/20261221_booking_time_allotment.sql` — span, windows,
  tourist gap the day after the last day. Same rule, same message.
- `supabase/migrations/20261222_booking_holds.sql` — the hold window and sweep.
- `supabase/migrations/20261223_operator_resources.sql` — fleet, needs, claims.
- `src/lib/tours/booking-windows.ts` — the TS mirror of the tourist rule, so the
  form can warn first. `TRANSFER_BUFFER_MIN` must match `tours_transfer_buffer()`.
- `src/lib/tours/operator-resources.ts` — the TS mirror of the resource rules.
- `src/lib/tours/booking-holds.ts` — the sweep the booking page runs, throttled.
- `src/app/api/cron/booking-holds/route.ts` — the same sweep as an endpoint.
- `src/app/(subsystems)/tours/operator/resources/` — the fleet page.
- `src/app/(subsystems)/tours/operator/packages/[id]/resources/` — what a tour needs.
- `scripts/booking-time-allotment.test.mjs` — the SQL rules against real Postgres
  (pglite), applying the migration files themselves.

### Two rules worth knowing before changing anything

1. **The buffer is applied to one side only.** "At least 45 minutes between two
   tours" means widening the existing booking and testing the plain new window.
   Widening both quietly demands 90.
2. **A resource runs one departure at a time.** Two *different* packages
   overlapping need separate units (two boats). Tourists on the *same* package
   share one boat, and their seats are already limited per date by
   `tours_package_availability` — so only a different package takes a unit away.
   That is what catches the 09:00 Calaguas trip and the 09:00 island-hopping trip
   trying to use one boat, while a family of 6 and a family of 4 booking the same
   09:00 tour still share it.

### Verified

- 2202 Jest tests, `npm run typecheck`, `eslint .` (0 errors).
- 20 Postgres tests for the three migrations, plus the 47 existing script tests.

### Not done

- **The live overlapping booking** (tourist `cba442a6…`, 2026-11-21) is left
  alone: it is a real customer's. §3a has the query to find these; ask the
  tourist which tour to keep.
- **`return_time`** was not added. A multi-day trip's last day is held whole,
  which is conservative and needs no new column. Add it if operators ask.
- **The resource day board** (rows = boats, columns = hours). The claims ledger
  has what it needs; it is a view, not a rule.

---

## 7. Decisions still open

1. **Transfer buffer** — 45 minutes is in `tours_transfer_buffer()` and
   `TRANSFER_BUFFER_MIN`. Change both, or neither. 90 for cross-town trips needs
   a per-package field; the current value is one number for everyone.
2. **Hard block, not a warning.** Overlap is refused outright, because the
   tourist physically cannot attend both. If groups ever split across two tours
   at once, this needs a per-booking "attending guests" concept first.
3. **Hold window** — `hold_minutes` defaults to 0, meaning *never expires*, so no
   existing package changes behaviour. An operator opts in per package. 120 (two
   hours) is the suggested default; nothing sets it yet.
4. **Fleet shape** — operators name individual boats and say how many of each
   (`units`), which covers both "Boat 1 / Boat 2" and "I have 2 boats". Naming
   them is what will make the day board readable.

---

## 8. Applying this

Migrations are applied by hand in the Supabase SQL editor, in this order:

1. `20261221_booking_time_allotment.sql`
2. `20261222_booking_holds.sql`
3. `20261223_operator_resources.sql`

Then set `CRON_SECRET` (any long random string) wherever you schedule
`/api/cron/booking-holds`. Without the secret the endpoint returns 503 and
releases nothing — harmless, because the booking page also sweeps.

**No `vercel.json` cron.** It was tried and removed: this project is on Vercel's
Hobby plan, which allows one cron run per day, and a `*/15 * * * *` entry makes
Vercel refuse to build the deployment at all (`Hobby accounts are limited to daily
cron jobs`). A 2-hour hold cannot wait for a daily run, so the sweep rides on page
visits instead. If the project moves to Pro, add the schedule back — the endpoint
is already there for it.
