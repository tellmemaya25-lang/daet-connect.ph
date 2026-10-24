# Shared CONNECT-Daet.ph tables (Chapter 4.2 §3)

The CONNECT-Daet.ph subsystems share one Supabase project. This page lists the tables that more than one team reads or writes, what each column means, and the rules every team follows. Tours (Team 8) tables are prefixed `tours_` and are not shared.

| Table | Owner | Status in the live project |
|---|---|---|
| `profiles` | Platform (Faculty Leads) | Live |
| `rewards_ledger` (+ `rewards_balances` view) | Team 11 (Rewards) | Live. Created by Team 8 in `20261103_f10_rewards.sql` because it did not exist yet; Team 11 may take it over without changes for callers |
| `impact_logs` | Platform | **Not created yet.** Proposed contract below; Team 8 will push to it once it exists |

## `profiles`

One row per Supabase Auth user, created by the `on_auth_user_created` trigger (`handle_new_user`).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | Same as `auth.users.id` |
| `full_name` | text, nullable | Shown to other users (e.g. guide name on a badge) |
| `role` | text | `tourist` (default), `operator`, `guide`, `admin`. Read it with `get_my_role()`; never trust a role sent by the client |
| `avatar_url` | text, nullable | |
| `created_at` | timestamptz | |

Rules:
- Signed-in users can read every profile (names are shown across subsystems); anonymous visitors can't.
- Users can update only `full_name` and `avatar_url` on their own row (column grant, since 2026-11-03).
- `role` changes only through the service role, e.g. when an admin approves an operator or guide application. Before that fix, a user could set their own role to `admin`.
- Other subsystems reference `profiles.id` as the user key, never `auth.users` directly.

## `rewards_ledger`

An append-only list of point awards and deductions. The balance is the sum of `points`.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `profile_id` | uuid → `profiles.id` (cascade) | Who gets the points |
| `points` | integer, non-zero | Negative for reversals (e.g. a refund) |
| `source` | text, `subsystem.event` | Lowercase, e.g. `tours.booking_paid`, `merch.order_placed` |
| `ref_id` | text | The id of the thing that caused the award (booking id, review id, …) |
| `description` | text, ≤ 200, nullable | Shown to the user |
| `created_at` | timestamptz | |

Constraint: **`UNIQUE (source, ref_id)`**. The same event can never be awarded twice, so webhooks, retries and double clicks are safe. A reversal uses its own source (e.g. `tours.booking_paid_reversed`) with the same `ref_id`.

Access:
- Users read their own rows, and admins read all. Nobody can insert, update or delete from the browser.
- Writes go through `rewards_add_points(profile_id, points, source, ref_id, description)`, which is idempotent and returns `true` when the award is new. Only the service role and database triggers can call it. It also sends a `points_earned` notification for positive awards.
- From server code, use `addPoints(adminClient, profileId, points, source, refId, description?)` in `src/lib/rewards.ts`.
- `rewards_balances` (security_invoker view) gives `balance`, `earned` and `entries` per profile, under the same visibility rules.

### Tours (Team 8) awards

Awarded by triggers in the same transaction as the event, so they also cover the PayMongo webhook, guide scans and operator actions:

| Source | Points | When | `ref_id` |
|---|---|---|---|
| `tours.booking_paid` | +50 | Booking's `payment_status` becomes `paid` | booking id |
| `tours.booking_paid_reversed` | −50 | A paid booking becomes `refunded` | booking id |
| `tours.checked_in` | +30 | First check-in on the booking | booking id |
| `tours.tour_completed` | +20 | Booking `status` becomes `completed` | booking id |
| `tours.review_written` | +10 | Review posted | booking id |
| `tours.itinerary_saved` | +5 | Trip plan saved (max 3 awards per Manila day) | itinerary id |

## `impact_logs` (proposed)

A daily aggregate per subsystem and partner, for municipal reporting. Proposed shape:

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `subsystem` | text | `tours`, `merch`, … |
| `day` | date | Manila date |
| `partner_id` | uuid, nullable | For tours: `tours_operators.id` |
| `metric` | text | `arrivals`, `bookings`, `revenue_php` |
| `value` | numeric | |
| `created_at` | timestamptz | |
| | | `UNIQUE (subsystem, day, partner_id, metric)` so a re-run upserts |

Once the table exists, Team 8 will add a scheduled Edge Function that upserts yesterday's values. Until then, the same numbers are available to admins from `tours_admin_analytics(from, to)` (see F9): check-ins per day, plus bookings and revenue per operator.
