# Adviser revisions R1–R6: specs and system design

These are the capstone adviser's six review suggestions. Each one is written up as a problem, a spec with acceptance criteria, a design and its tests. The status of each item is in [`FEATURE_PLAN.md`](FEATURE_PLAN.md#adviser-revisions-r1r6).

| # | Adviser's note | What we build | Touches |
|---|---|---|---|
| R1 | Place suggestions repeat on the landing page and the operator and tourist dashboards | Only visitors and tourists see the exploration menu; dashboards show only role links | `site-header.tsx` |
| R2 | "What do you enjoy?" needs an "All categories" choice | An **All** chip in the trip planner, which the trip assistant also understands | `planner-app.tsx`, `itinerary/assistant.ts` |
| R3 | Prices should always show `.00` (₱850.00) | One `formatPeso` used for every amount shown | `src/lib/money.ts` and its call sites |
| R4 | More accounts for guides, operators and tourists | A realistic demo seed: 5 operators, 8 guides, 10 tourists, with bookings, reviews and schedules | `scripts/seed-demo.mjs` |
| R5 | The AI customer service should answer transport and travel-time questions | Curated transport facts, plus a `travel_time` tool that uses the map routes | `src/lib/tours/assistant/*` |
| R6 | A guide can suggest moving a tourist to another guide; guides must have a schedule | The schedule is enforced in the database; swap requests that the operator approves | migration `20261108_guide_schedule_swaps.sql`, guide and operator pages |

---

## R1 — No repeated "places to visit" on dashboards

**Problem.** Every page renders the tourist exploration menu in the header (Plan a trip · Attractions · Events · Souvenirs), including the operator, guide and admin dashboards. On those pages it repeats the landing page's suggestions and has nothing to do with the user's work.

**Spec.**
- Visitors (signed out) and tourists see the exploration menu.
- Operators, guides and admins see their role links instead (dashboard, bookings, packages and so on). Admins keep Attractions, Events and Souvenirs, because they manage them.
- The landing page keeps its single "Three places to start" section.
- The tourist dashboard adds no place suggestions of its own.

**Design.** `SiteHeader` already knows the signed-in role. It renders `PUBLIC_LINKS` only when the role is `null` or `tourist`.

**Tests.** e2e:
- the operator and guide dashboard headers have no "Souvenirs" or "Plan a trip" link;
- the visitor and tourist headers still have them.

## R2 — "All" in "What do you enjoy?"

**Spec.**
- An **All** chip comes first in the planner's interest chips.
- It is pressed when every category is selected. Tapping it selects every category, or, if it is already pressed, clears them all.
- With nothing selected, a hint says "No preference: we'll mix everything", and the scorer treats an empty list as neutral (`score.ts`).
- The trip assistant understands "all", "everything", "anything" and "lahat".

**Design.** The All state is derived (`interests.length === categories.length`), not stored, so the plan input format doesn't change.

**Tests.** Jest covers the assistant parser. e2e: tapping All presses every chip.

## R3 — Prices always with two decimals

**Problem.** Amounts were formatted in about 15 places with local helpers. Some showed ₱850 (browse, the package page, the booking form, my bookings) and others ₱850.00 (payments, dashboards).

**Spec.**
- Every amount shown to a person reads `₱` + thousands separators + 2 decimals, e.g. **₱1,850.00**. This covers pages, server messages, assistant replies and cards.
- CSV exports keep plain numbers with 2 decimals, so spreadsheets can read them.
- The admin analytics chart axes keep whole pesos for readability; the tables use the 2-decimal format.

**Design.** `src/lib/money.ts` has `formatPeso(value)`, which uses `Intl.NumberFormat("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })`. All the local `peso()` helpers and raw `₱{x.toLocaleString()}` calls now use it.

**Tests.**
- Unit tests for `formatPeso`.
- A guard test fails if new code formats pesos without `formatPeso`.

## R4 — More demo accounts (realistic data set)

**Spec.** `DEMO_PROFILE=realistic npm run seed:demo` creates:

| Role | Count | With |
|---|---|---|
| Operators | 5 | Approved businesses, 1–2 published packages each (Calaguas, Mercedes island hopping, Bagasbas surf, Daet heritage walk, Vinzons), price variants, open dates for 60 days |
| Guides | 8 | Approved, bio and specialties, linked to packages, a 60-day schedule (some days unavailable or not set on purpose) |
| Tourists | 10 | Upcoming bookings: confirmed with an assigned guide who is free that day (paid in full or in part), pending requests, and one cancellation |
| Admins | 1 | Tourism Office |

**Rules.**
- Passwords come only from `DEMO_PASSWORD` and are never committed.
- Emails use the reserved `demo.connect-daet.test` domain.
- `--dry-run` prints the plan and changes nothing.
- Re-running updates rows in place. Seeded bookings (`BK-DEMO-…`) are created once and never rewritten.
- Bookings go through the real database rules (capacity, lifecycle, guide schedule). Those rules reject past dates, so past completed tours and reviews aren't seeded; the evaluation walkthroughs create them.
- Use it on a staging or evaluation project, not the production project.

**Tests.** `scripts/seed-demo.test.mjs` checks:
- the counts and that every email is unique;
- that all dates are in the future;
- that every assigned booking's guide is available that day and not double-booked (the same rule as R6).

## R5 — Assistant answers transport and travel-time questions

**Spec.** The 24/7 assistant (with Claude, and in basic mode) answers:
- **Getting to Daet:** buses from Manila (about 7–9 hours), flying to Naga plus a van (about 2 hours), and driving.
- **Getting around:** tricycles, jeepneys and vans, with fare ranges.
- **Boats:** Calaguas from Paracale or Vinzons, Mercedes for the islands; boat times, the best season, and that trips are cancelled in bad weather.
- **"How long from X to Y?"** between listed places, towns and ports: distance, time, and a Google Maps directions link.

Transport facts are curated in `transport.ts`, each with a source and the date it was checked. They are shown as "about" ranges that say to confirm with the operator or the Tourism Office. **They are provisional until the team verifies them**, the same as the attraction seed.

**Design.**
- `transport.ts` holds the FAQ entries `getting_here`, `getting_around` and `boats`, plus a table of town and port coordinates and boat legs.
- The new read-only tool `travel_time({from, to})`:
  1. resolves names against the listed attractions, then towns and ports;
  2. answers sea legs from the boat table;
  3. otherwise uses the cached road leg (`route-legs.ts`, Google Routes when configured), or a straight-line estimate × 1.4 at 30 km/h (`geo.ts`). An estimated time is labelled as such.
- Basic mode routes "how long / gaano katagal / ilang oras … from A to B" to the same function.

**Tests.**
- Jest: name resolution, the estimate fallback, sea legs, Taglish matching, and the tool's registration.
- `docs/ASSISTANT_EVAL.md` has new questions.
- e2e: in basic mode, "How long from Daet to Bagasbas?" gets an answer.

## R6 — Guide schedules and swap requests

**Problem.** Before this change:
- operators could assign any approved guide on any date, even one marked unavailable or already on another tour that day;
- a guide could only message the operator to ask for a replacement.

**Spec: the schedule is enforced.**
- An operator can assign a guide to a booking only if the guide is approved, marked the tour date **available**, and has no other active booking that day (`pending`, `confirmed` or `paid`).
- The picker shows why a guide can't be chosen ("Not available that day", "Already on a tour that day").
- A guide can't mark a day unavailable while assigned that day. They ask for a swap first.
- The guide's calendar shows each day as **On a tour**, **Available**, **Unavailable** or **Not set**. It has a quick "every Saturday and Sunday for 8 weeks" fill.

**Spec: swap requests.**
1. On an upcoming assigned tour, the guide taps **Suggest another guide**. They choose a guide who is free that day, or *Let the operator choose*, and write a reason (required, at most 300 characters).
2. The operator is notified and sees the request on the booking, with **Approve** and **Reject**. If no guide was named, Approve asks the operator to pick one.
3. **Approve** moves the booking to the new guide in one transaction, re-checking that they are still free. The old guide gets "Swap approved"; the new guide and the tourist get the existing "guide assigned" notifications.
4. **Reject** notifies the requesting guide, with the operator's note.
5. A booking has at most one pending request. The guide can withdraw it. Once the tour date has passed, a pending request can't be decided.

**System design.**

```mermaid
sequenceDiagram
  participant G as Guide (assigned)
  participant DB as Supabase (RLS + RPCs)
  participant O as Operator
  participant N as Notifications (bell + push)
  participant T as Tourist
  participant G2 as New guide
  G->>DB: tours_request_guide_swap(booking, to_guide?, reason)
  DB->>DB: caller is the assigned guide? future date? to_guide free?
  DB->>N: guide_swap_requested → operator
  O->>DB: tours_decide_guide_swap(request, approve, guide?, note)
  DB->>DB: lock booking FOR UPDATE, re-check guide is free
  DB->>DB: UPDATE tours_bookings.assigned_guide_id (guard trigger)
  DB->>N: guide_swap_approved → G; guide_assigned → G2 and T (existing trigger)
```

**Database objects.** The migration `20261108_guide_schedule_swaps.sql` adds:
- **`tours_guide_is_free(guide, date, exclude_booking)`:** the one rule, used by the triggers, the RPCs and the picker (through `tours_guides_free_on`).
- **The trigger `tours_bookings_guide_schedule_guard`** (BEFORE INSERT or UPDATE of `assigned_guide_id`, `tour_date`): rejects assigning a guide who isn't free.
- **The trigger `tours_guide_availability_guard`:** rejects marking a day unavailable, or deleting it, while the guide is booked that day.
- **The table `tours_guide_swap_requests`:**
  - columns: `booking_id`, `from_guide_id`, `to_guide_id?`, `reason`, `status` (`pending | approved | rejected | cancelled`), `decided_by`, `decision_note`, `decided_at`;
  - a partial unique index allows one pending request per booking.
  - **RLS:**
    - the requesting guide, the named guide and the booking's operator can read;
    - no one writes directly;
    - all writes go through SECURITY DEFINER RPCs.
- **The RPCs** `tours_request_guide_swap`, `tours_decide_guide_swap` and `tours_cancel_guide_swap`, plus `tours_guides_free_on(date, exclude_booking)` for the pickers.
- **Notifications** reuse `tours_notify(...)`, with the new types `guide_swap_requested`, `guide_swap_approved` and `guide_swap_rejected`. The new guide and the tourist are told by the existing `guide_assigned` branch of `tours_notify_booking_events`.

**App.**
- `src/lib/tours/guide-swap.ts` holds the validation, labels and the reason-to-message mapping for database errors.
- The guide's My tours page has a swap form.
- Operator bookings show the pending-request cards and the guide picker with reasons.
- The guide dashboard has the schedule calendar.

**Tests.**
- **Live database:** rolled-back checks in `supabase/tests/guide_swaps.sql` (20 checks):
  - unavailable and double-booked assignments fail;
  - a booked guide can't mark that day unavailable;
  - only the assigned guide can request a swap, and only one request can be pending;
  - approve moves the guide and notifies everyone;
  - reject changes nothing;
  - other users can't read requests.
- **Jest:** helpers and actions.
- **e2e:** the guide requests a swap, then the operator approves it; at 375px with axe.

## Dependencies and order

```
R3 money ─┐
R2 All ───┼─ independent, small
R1 header ┘
R5 transport ── uses the F6 route cache (route-legs.ts) and the F13 assistant
R6 schedule + swaps ── migration first, then the UI
R4 demo seed ── uses R6's schedule rule, so it runs after R6
```
