# Daet Tours — Remaining Features Implementation Plan

_Prepared 2026-10-23 · Branch `claude/epic-cray-pgfa7m` (PR #5) · Companion to [`AUDIT_AND_ROADMAP.md`](./AUDIT_AND_ROADMAP.md)_

This plan covers every feature still missing from the **Daet Local Tour Operator and Itinerary Booking Platform** (CONNECT-Daet.ph subsystem). The capstone context document's SOP 1–4 and the ISO/IEC 25010 evaluation form drive the scope. Each feature lists what already exists in the **live Supabase database**, what to build, where the code goes, how to test it, and when it's done.

---

## 0. Ground truth: what the live database already has

I inspected the production Supabase project (`CONNECT-DAET.ph`, Postgres 17) read-only on 2026-10-23. **Many tables these features need already exist but no code uses them.** Build on them; don't create duplicates.

| Table (live) | Rows | Used by code? | Feature that should own it |
|---|---|---|---|
| `tours_package_availability` (date, capacity_total, capacity_booked) | 0 | ❌ | F2 Availability |
| `tours_guide_availability` (guide_id, available_date, is_available) | 0 | ❌ | F9 Guide dashboard |
| `tours_booking_participants` (full_name, age, special_requirements) | 0 | ❌ | F2 Booking / F3 Roster |
| `tours_cancellations` (enum `cancellation_status`) | 0 | ❌ | F2 Cancellations |
| `tours_payments` (method, status, reference, receipt) | 2 | ✅ manual recording | F1 **canonical ledger** |
| `tours_booking_payments` | 0 | ❌ | F1 — **duplicate, retire** |
| `tours_payment_proofs` (reference, proof image, verification) | 0 | ❌ | F1 Manual GCash proof |
| `tours_qr_scan_logs` (guide_id, scanned_by, revealed_full_id) | 0 | ❌ | F3 Guide verification log |
| `tours_conversations`, `tours_messages` | 0 | ❌ | F4 Messaging |
| `push_subscriptions` (endpoint, p256dh, auth) | 0 | ❌ | F5 Web Push |
| `tours_itineraries`, `tours_itinerary_items` | 0 | ❌ | F7 Itinerary planner |
| `tours_reviews` (rating 1–5, photos) | 0 | ❌ | F8 Reviews |
| `tours_package_guides` | 0 | ❌ | F2/F9 Guide pool per package |
| `tours_guides.qr_code_value` | — | ❌ | F3 Signed QR |

**Database defects found** (all go into F0):

| # | Defect | Effect |
|---|---|---|
| D1 | Enum `package_status` = `draft, pending_review, published, archived`, **no `rejected`**. Admin review (`admin/packages/[id]/actions.ts`) sets `status = 'rejected'`. | **Rejecting a package fails in production.** |
| D2 | Admin dashboard counts `tours_packages.status = 'pending'` (`admin/page.tsx`). That isn't a valid enum value. | "Pending Packages" card is always wrong or errors. |
| D3 | Two booking-status systems: enum `booking_status` (`pending_payment … refund_confirmed`) is unused, while `tours_bookings.status` is varchar CHECK (`pending, confirmed, cancelled, completed, rejected`). | Ambiguous lifecycle; F2 must pick one. |
| D4 | Three payment tables (`tours_payments`, `tours_booking_payments`, `tours_payment_proofs`). | Ledger ambiguity (SOP 1 item 7, the top pain point). |
| D5 | Migration `20261023_create_tours_events_and_merchandise.sql` (PR #5) **not applied** yet. | `/tours/events` and `/tours/merch` show load errors. |
| D6 | Supabase advisors: 8 functions with mutable `search_path`; `get_my_role` and `handle_new_user` (SECURITY DEFINER) callable by `anon`; `tours_guide_sensitive_info` has RLS with no policies (fine if it's service-role only — document it); leaked-password protection off. | Security evaluation findings. |

---

## 1. Conventions every feature follows

- **Location:** `src/app/(subsystems)/tours/**` for routes, `src/lib/tours/**` for logic, `src/components/tours/**` for UI. Table prefix `tours_`.
- **Pure logic first:** every rule (pricing, capacity, state transitions, token signing, scheduling) lives in a plain TypeScript module with unit tests. Server Actions stay thin: auth → parse → call logic → DB.
- **`"use server"` files export only async functions.** Helpers go in sibling modules. This rule broke the build in PR #4.
- **Auth on every action:** `getAuthenticatedSession()`, then a role check, then an ownership/accreditation check. RLS enforces the same rule a second time.
- **Money** is computed server-side from DB rows, never trusted from the client. Store it as `numeric(10,2)` pesos; convert to centavos only at the PayMongo boundary.
- **Time:** dates and times shown and entered in Asia/Manila. Reuse `src/lib/tours/events-calendar.ts` helpers.
- **UI standards:** mobile-first at 375 px, touch targets ≥ 44 px, `rounded-2xl` cards, `rounded-full` primary buttons, confirmation before destructive actions, and validation errors that keep the user's input (see `use-promo-form.ts`).
- **Migrations:** one timestamped file per feature in `supabase/migrations/`, idempotent (`IF NOT EXISTS`, `DROP POLICY IF EXISTS`), with `SET search_path = public` on every function.
- **Definition of done** for every PR: `npm ci && npx tsc --noEmit && npm test && npx next build` all green, new logic covered by tests, 375 px screenshot check, RLS reviewed, Supabase advisors re-run with no new warnings.

---

## 2. Dependency map

```
F0 Stabilize ──┬─> F1 Payments ──┬─> F9 Dashboards (revenue) ──> F12 Evaluation
               ├─> F2 Bookings ──┼─> F3 QR check-in ─────────────┘
               │                 ├─> F8 Reviews
               │                 └─> F10 Rewards
               ├─> F5 Notifications <── (F1, F2, F3, F4 emit events)
               ├─> F4 Messaging
               └─> F6 Attractions + Maps ──> F7 AI Itinerary
```

F0 blocks everything. After it, three tracks can run in parallel: **Transactions** (F1 → F2 → F3), **Engagement** (F5 → F4 → F8) and **Planning** (F6 → F7).

---

## F0 — Stabilize the base (Week 1) · _blocks all other work_

**Goal:** `main` builds, deploys to Vercel and passes CI. The database matches the code.

| Task | Files / objects |
|---|---|
| Move sync exports out of `operator/packages/[id]/edit/actions.ts` (6 functions) into `permissions.ts` / `validation.ts` | fixes `next build` |
| Fix ~45 app-code TS errors (image step signatures, `PackageStatus`, `.catch` on Postgrest builder, PayMongo default import) | `CoverImageStep.tsx`, `GalleryStep.tsx`, `EditPackageForm.tsx`, `gallery-schema-verification.ts`, `paymongo/client.ts` |
| Fix the 5 failing tests (NaN duration is a real bug; the other 4 are stale) | `package-validation.ts`, 3 test files |
| **D1:** `ALTER TYPE package_status ADD VALUE 'rejected'` and add `'rejected'` to `PackageStatus` | migration `…_f0_fixes.sql` |
| **D2:** admin dashboard counts `pending_review` | `admin/page.tsx` |
| **D5:** apply the events/merch migration | Supabase |
| **D6:** `ALTER FUNCTION … SET search_path = public` (8 functions); `REVOKE EXECUTE ON FUNCTION get_my_role, handle_new_user FROM anon`; enable leaked-password protection | migration + dashboard toggle |
| Regenerate `package-lock.json`; add `.github/workflows/ci.yml` (install → typecheck → test → build) | CI |
| Add `src/middleware.ts` (Supabase session refresh) | auth |
| Delete `operator/debug-profile`; move root status docs to `docs/`; delete `test-*.txt` | cleanup |
| Generate DB types (`supabase gen types typescript`) → `src/lib/supabase/database.types.ts`; type the clients | catches D1/D2-type bugs at compile time |
| Shared UI kit: `src/components/ui/{button,input,select,textarea,modal,card,badge,empty-state}.tsx` | used by all later features |

**Acceptance:** green CI on `main`; Vercel preview deploys; rejecting a package works; the advisor list shows no WARN items except ones documented as intentional.

---

## F1 — Payments: PayMongo sandbox + unified ledger (Weeks 2–3)

_SOP 1 item 7 (x̄ = 3.70, highest pain), item 8; ISO 25010 Functional Appropriateness._

**Data**
- `tours_payments` becomes the **only ledger**. Add `provider` (`paymongo | manual`), `provider_ref` (unique), `raw_event jsonb`, `idempotency_key` (unique).
- Keep `tours_payment_proofs` for **manual GCash/bank proof uploads**. On verification, insert a `tours_payments` row.
- Drop `tours_booking_payments` once it's confirmed empty (it is: 0 rows).
- New `tours_payment_events` (event_id PK, type, received_at, processed_at) for webhook idempotency.
- Postgres function `recalculate_booking_payment(booking_id)` → sets `total_paid`, `payment_status` (`unpaid | partial | paid | refunded`) from the ledger. Call it from a trigger on `tours_payments`.

**Code**
| File | Purpose |
|---|---|
| `src/lib/paymongo/client.ts` | Lazy client (no throw at import), sandbox/live by key prefix |
| `src/lib/paymongo/checkout.ts` | `createCheckoutSession(booking)`: amount = `total_amount − total_paid` from DB, `metadata.booking_id`, success/cancel URLs |
| `src/lib/paymongo/webhook.ts` | `verifySignature(header, rawBody, secret, now)`: HMAC-SHA256 over `t.rawBody`, ±5 min tolerance, constant-time compare |
| `src/app/api/webhooks/paymongo/route.ts` | Reads raw body → verify → idempotent insert into `tours_payment_events` → on `checkout_session.payment.paid` insert a ledger row (service role) → emit notification (F5) |
| `tours/my-bookings/pay-button.tsx` | Replaces `gcash-payment-button.tsx`; redirects to the checkout URL |
| `tours/bookings/[id]/upload-proof.tsx` + action | Manual GCash proof → `tours_payment_proofs` + private bucket `tours-payment-proofs` |
| `tours/operator/bookings/verify-proof.tsx` + action | Operator approves/rejects a proof → ledger row |
| `tours/operator/payments/page.tsx` | Ledger view per booking, CSV export |

**Env:** `PAYMONGO_SECRET_KEY`, `NEXT_PUBLIC_PAYMONGO_PUBLIC_KEY`, `PAYMONGO_WEBHOOK_SECRET`, `NEXT_PUBLIC_APP_URL`.

**Tests:** signature valid / invalid / expired / replayed; tampered amount ignored; duplicate webhook event processed once; partial then full payment → `partial` → `paid`; refund → `refunded`.

**Acceptance:** in sandbox, a tourist pays a ₱8,500 booking with GCash test credentials. The booking shows **Paid** within seconds without anyone touching it. The operator ledger shows the PayMongo reference.

---

## F2 — Availability, capacity & booking lifecycle (Weeks 3–4)

_SOP 1 items 3–4; ISO 25010 User Error Protection ("double-booking", "invalid dates")._

**Data**
- Use `tours_package_availability`. Add `UNIQUE (package_id, available_date)` and `CHECK (capacity_booked <= capacity_total)`.
- **Resolve D3:** migrate `tours_bookings.status` to the existing `booking_status` enum, mapping `pending → pending_payment` and `rejected → cancelled`. Drop the varchar CHECK.
- Lifecycle (one source of truth, `src/lib/tours/booking-lifecycle.ts`):
  `pending_payment → payment_submitted → confirmed → in_progress → completed`
  plus `→ cancelled`, `→ refund_requested → refund_confirmed`.
  Transitions are keyed by actor (tourist / operator / guide / admin / system). Unit-test the full matrix.
- RPC `create_booking(p_package_id, p_date, p_pax, p_variant_id, p_contact jsonb, p_participants jsonb)` (SECURITY DEFINER, `search_path` set): `SELECT … FOR UPDATE` on the availability row → check remaining capacity → compute price from the variant → insert booking + participants → increment `capacity_booked` in **one transaction**. A cancellation decrements the count.
- Use `tours_cancellations` for tourist requests. Operator/admin resolves; refunds link to F1.

**Code**
| File | Purpose |
|---|---|
| `tours/operator/packages/[id]/availability/page.tsx` | Month calendar (reuse the events grid) to open dates and set capacity; bulk "every Saturday in Nov" |
| `tours/packages/[id]/book/booking-form.tsx` | Date picker shows only open dates with remaining slots; participant names list |
| `tours/packages/[id]/book/actions.ts` | Calls the `create_booking` RPC |
| `tours/bookings/[id]/cancel-request.tsx` | Tourist cancellation request with cutoff rule (e.g. ≥ 48 h before) |
| `tours/operator/bookings/*` | Accept/decline, mark in-progress/completed through the lifecycle module only; also check `accreditation_status = 'approved'` |

**Tests:** concurrent bookings for the last slot → exactly one succeeds (integration test with two parallel RPC calls); past and closed dates rejected; every illegal transition rejected.

**Acceptance:** the platform can't overbook; every status change follows the lifecycle; a tourist can request cancellation and see its outcome.

---

## F3 — Signed QR: verification, tickets & check-in (Weeks 4–5)

_SOP 1 items 5–6 (x̄ 3.51, 3.57); Ch. 4.3 §2._

**Token design** (`src/lib/tours/qr-token.ts`)
- Format: `CD1.<type>.<id>.<exp>.<sig>` where `type ∈ {guide, operator, booking}` and `sig = base64url(HMAC-SHA256(QR_SIGNING_SECRET, "CD1|type|id|exp"))`. Guide/operator badges expire 1 year after accreditation; booking tickets expire at the end of the tour day.
- Store the current token in `tours_guides.qr_code_value` (already a column) and regenerate on re-approval.
- `verifyQrToken(token, now)` → `{ ok, type, id } | { ok: false, reason }`, using a constant-time compare.

**Data**
- Existing `tours_qr_scan_logs`: log every badge verification (who scanned, when).
- New `tours_checkins` (booking_id, participant_id nullable, guide_id, scanned_at, method `qr|manual`), with `UNIQUE (booking_id, participant_id)`.

**Code**
| Route | Who | What |
|---|---|---|
| `/tours/verify/[token]` | Public | Green "Accredited" card (photo, name, operator, valid until) or red "Not valid / expired". Shows no ID numbers. |
| `/tours/bookings/[id]/ticket` | Tourist | Booking QR (offline-friendly, printable) |
| `/tours/guide/check-in` | Guide | Camera scanner (`BarcodeDetector`, fallback `@zxing/browser`). Validates: booking token is valid, tour date is today, guide is assigned, status is `confirmed`. Marks participants present; moves the booking to `in_progress`. |
| `/tours/guide/tours/[bookingId]/roster` | Guide | Participant list with check-in state and a manual check-in fallback |

**Tests:** forged/modified/expired tokens rejected; wrong-day and wrong-guide scans rejected; double scan is idempotent.

**Acceptance:** a tourist's phone ticket is scanned by the assigned guide on tour day, the roster updates, and the badge verification page works from any phone camera.

---

## F4 — Real-time messaging (Week 6)

_SOP 1 items 3–4; Ch. 4.3 §3 "real-time communication"._

- Use the existing `tours_conversations` / `tours_messages`. Add RLS so only participants (tourist, the booking's operator, the assigned guide) can read and insert. Index `(conversation_id, created_at)`.
- A conversation is created automatically per booking on confirmation (F2 hook).
- `tours/messages/page.tsx` (inbox) and `tours/messages/[id]/page.tsx` (thread) use Supabase Realtime `postgres_changes` on `tours_messages` filtered by `conversation_id`; set `is_read` on view.
- Text only plus an optional image attachment (private bucket, signed URLs). Limit 1,000 characters; server-side rate limit of about 20 messages/min.
- **Acceptance:** tourist and operator chat about a booking in real time on two phones, and no one else can read the thread (RLS test with a third account).

---

## F5 — Notifications: in-app + Web Push (Weeks 5–6)

_Ch. 4.3 §3; the context doc names FCM or WebSockets, and this uses Supabase Realtime plus the standard Web Push API._

- New `tours_notifications` (profile_id, type, title, body, link, read_at, created_at) with RLS so users see only their own rows.
- `src/lib/tours/notify.ts` → `notify(profileId, type, payload)` (server-only, service role): inserts the row, then sends Web Push to every `push_subscriptions` row (the table already exists) using `web-push` with VAPID keys. Delete the subscription on HTTP 404/410.
- Header bell component: unread count, Realtime subscription, dropdown list, "mark all read".
- Service worker `public/sw.js` plus an opt-in prompt after the first booking.
- **Triggers:** booking created/confirmed/cancelled, payment received/proof rejected, guide assigned, check-in done, new message, accreditation approved/rejected, package approved/rejected, review received.
- **Env:** `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.
- **Acceptance:** an operator receives a push on their phone within seconds of a tourist's payment confirming.

---

## F6 — Daet tourism dataset + Google Maps (Weeks 5–6)

_SOP 3 "Baseline Tourism Dataset"; SOP 2 Google Maps; ISO 25010 Functional Correctness._

**Data:** new `tours_attractions`:
`id, name, slug, category (beach|heritage|nature|food|adventure|shopping|religious), description, latitude, longitude, address, opening_hours jsonb ({mon:[["08:00","17:00"]],…}), dwell_minutes, entrance_fee numeric, photo_url, source, is_active`.
Seed **≥ 30 Daet attractions** from Municipal Tourism Office data (`supabase/seed/attractions.sql`). The team collects this data.

New `tours_route_cache` (origin_id, dest_id, mode, distance_m, duration_s, polyline, fetched_at) with `UNIQUE (origin_id, dest_id, mode)`.

**Code**
| File | Purpose |
|---|---|
| `src/lib/tours/opening-hours.ts` | `isOpenAt(hours, date)`, `nextOpenWindow` (pure, tested) |
| `src/lib/maps/routes.ts` (server-only) | Routes API `computeRoutes` (polyline, distance, duration) and `computeRouteMatrix`; reads and writes the cache; falls back to Haversine × 1.4 road factor when the API is unavailable |
| `src/components/maps/route-map.tsx` (client) | Maps JS API: markers + polyline; key restricted by HTTP referrer |
| `/tours/attractions`, `/tours/attractions/[slug]` | Public directory with filters, "Open now" badge, map |
| `/tours/admin/attractions` | Admin CRUD (same pattern as admin events) |
| Package detail page | Route map of the package stops (`tours_package_stops` already has lat/lng) |

**Env:** `GOOGLE_MAPS_SERVER_KEY` (Routes API only), `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` (Maps JS only, referrer-restricted). Set a monthly budget alert.

**Acceptance:** the attraction directory is live with real data, and package pages show the route with total distance and travel time.

---

## F7 — AI-assisted itinerary planner (Weeks 7–8)

_SOP 3 "AI-Assisted Module"; ISO 25010 Functional Correctness; Learnability._

Follow the context doc's feasibility guidance: **no custom ML training.**

**7a. Rule-based engine (required, ships first)**: `src/lib/tours/itinerary/`
1. `filter.ts`: keep attractions matching interests, budget per day and accessibility.
2. `score.ts`: score = interest match + popularity − cost penalty.
3. `schedule.ts`: for each day from the start time (default 08:00), greedily pick the highest-scoring reachable attraction that is **open on arrival** and fits before the end time (default 18:00), using the travel matrix (F6). Insert a lunch block at 11:30–13:30 from `food` attractions.
4. `validate.ts`: **constraint checker**: every block inside opening hours, no overlaps, travel time respected, total cost ≤ budget, every ID exists.
5. Output: `{ days: [{ date, blocks: [{ attractionId, start, end, travelMinutesFromPrev, cost }] }], totals }`.

**7b. LLM refinement (optional, behind a flag)**: `src/lib/tours/itinerary/llm.ts`
- Prompt = user preferences + the **curated attractions JSON** only (no web knowledge) + the 7a draft. Require structured JSON output against the same schema.
- Every LLM result goes through `validate.ts`; when validation fails, fall back to the 7a draft. The LLM only reorders, writes friendlier descriptions and suggests swaps.
- Provider is the team's choice (the context doc mentions Gemini or OpenAI; Claude works the same). Keep the key server-side, set a timeout of about 15 s, and cache by preference hash.

**UI**: `/tours/plan`
- Step 1: dates (1–5 days), budget, interests (chips), pace (relaxed / normal / packed), group size.
- Step 2: time-blocked timeline per day plus map (F6), "swap", "remove" and "add" per block, re-validated live.
- Step 3: "Save" → existing `tours_itineraries` / `tours_itinerary_items` tables (store `ai_prompt_used`); "Book matching tours" suggests published packages whose stops overlap the plan.
- `/tours/my-itineraries`: list, view, delete, share link.

**Tests:** property-based (fast-check is already installed). For random attraction sets and preferences, the rule-based output **always** passes `validate.ts`, and invalid LLM output always falls back.

**Acceptance:** a tourist generates a valid 2-day plan in under 5 seconds, sees it on the map, saves it, and books a suggested package.

---

## F8 — Reviews & ratings (Week 7)

_ISO 25010 Appropriateness Recognizability; SOP 1 trust._

- Use the existing `tours_reviews`. Add `UNIQUE (booking_id)` and RLS: insert only by the booking's tourist **after status = `completed`**; public read.
- After completion, notify the tourist (F5) with a "Rate your tour" prompt.
- Show the average rating and review count on package cards, package detail, operator and guide profiles. Use a SQL view `tours_package_ratings` for averages.
- Operators can post one public reply (new column `operator_reply`, `replied_at`); admins can hide abusive reviews (`is_hidden`).
- **Acceptance:** only completed bookings can be reviewed, once each, and ratings appear on browse cards.

---

## F9 — Role dashboards completion (Weeks 8–9)

_Ch. 4.3 §3 RBAC matrix; ISO 25010 Functional Completeness._

| Dashboard | Build |
|---|---|
| **Tourist** `/tours/me` | Upcoming trips with ticket QR, payment status and pay button, saved itineraries, messages, reviews to write, rewards points |
| **Operator** `/tours/operator/dashboard` | Today's tours; booking calendar; **revenue report** from the ledger (month, package, payment method; CSV); occupancy % from availability; ratings |
| **Guide** `/tours/guide/dashboard` | Schedule calendar; set availability (`tours_guide_availability`); today's roster and check-in scanner shortcut; QR badge |
| **Admin** `/tours/admin/analytics` | Municipal KPIs: arrivals (check-ins/day), bookings and revenue per operator, cancellation rate, top attractions and packages, accreditation queue ageing, rating distribution. SQL views/RPCs only, with charts (lightweight, e.g. Recharts) |
| Shared | Unified role-aware `/dashboard` redirect; bottom tab bar on mobile for each role |

**Acceptance:** each of the 4 evaluator personas can do their whole job from their dashboard without typing URLs.

---

## F10 — Rewards Engine & CONNECT-Daet integration (Week 9)

_Team guide §5; Ch. 4.2 §3 DB synchronization._

- If Faculty Leads haven't shipped it: `src/lib/rewards.ts` → `addPoints(profileId, points, source, refId)` writing `rewards_ledger` (shared table owned by Team 11), with `UNIQUE (source, ref_id)` so a retry never double-awards.
- Award points from Team 8 events: booking paid (+50), checked in (+30), tour completed (+20), review written (+10), itinerary saved (+5). Awards happen server-side only, inside the same action that causes them.
- `impact_logs` push (if the parent platform provides the table): daily aggregate of arrivals, revenue and bookings per operator via a scheduled Edge Function.
- Document the shared-table contract (`profiles`, `rewards_ledger`, `impact_logs`) for Chapter 4.2 §3.
- **Acceptance:** points appear in the tourist dashboard and are never awarded twice for the same booking.

---

## F11 — Events & merchandise follow-ups (Week 6, small)

- Apply the migration (D5) and seed the real 2026 Daet events calendar (Pinyasan Festival, Bagasbas surfing events, Undas, Christmas events) with the Tourism Office.
- Optional: let approved operators submit merchandise for admin approval (`submitted_by_operator_id`, status `pending|approved`).
- Link events to attractions (F6) and show "Tours happening during this event" on the event page.

---

## F12 — Testing, hardening & ISO 25010 evaluation readiness (Weeks 10–11)

| Area | Deliverable |
|---|---|
| E2E (Playwright, 375 px) | **Golden path:** tourist plans an itinerary → books a suggested package → pays in the PayMongo sandbox → webhook confirms → guide scans the ticket → tour completed → tourist reviews → admin analytics updates. Plus one path per role. |
| Integration | RLS tests per table with 4 role accounts; capacity race test; webhook replay test |
| Seed / demo mode | `supabase/seed.sql` with 4 role accounts per evaluator group, sample attractions, packages, availability and events; a sandbox money note on the login page |
| Accessibility | Labels, focus states, contrast ≥ 4.5:1, `lang`, axe check in E2E |
| Performance | Lighthouse mobile ≥ 85 on browse, package and plan pages; image sizes; route cache hit rate |
| Security | Advisor clean; secret scan; no service-role key in the client bundle; signed QR and webhook verified; rate limits on auth, messages and bookings |
| Evaluation kit | Printable walkthrough script (10–15 min per role) and test credentials sheet for SOP 4 sessions |

---

## 3. Schedule (11 weeks)

The schedule assumes about 4 developers. **A** = Transactions lead, **B** = Engagement, **C** = Planning/Maps, **D** = UI/QA. With fewer people, run the tracks one after another (about 16–18 weeks).

| Week | A — Transactions | B — Engagement | C — Planning | D — UI / QA |
|---|---|---|---|---|
| 1 | **F0 (all hands)** | F0 | F0 | F0 + UI kit |
| 2 | F1 checkout + webhook | F5 schema + notify() | F6 attractions data collection + schema | E2E harness, seed data |
| 3 | F1 ledger, proofs, F2 lifecycle | F5 bell + Web Push | F6 directory + admin CRUD | Booking UI polish |
| 4 | F2 availability + `create_booking` RPC | F4 schema + RLS | F6 Routes API + cache + map | F2 tests |
| 5 | F3 tokens + verify page | F4 chat UI | F6 package route maps | F3 ticket UI |
| 6 | F3 scanner + roster | F11 events follow-ups | F7a filter/score/schedule | F4/F5 E2E |
| 7 | F8 reviews | F8 UI | F7a validate + UI | F7 property tests |
| 8 | F9 operator revenue | F9 tourist dashboard | F7b LLM layer + save | F9 guide dashboard |
| 9 | F10 rewards | F9 admin analytics | F7 "book matching tours" | Accessibility pass |
| 10 | F12 security + RLS tests | F12 perf | F12 itinerary edge cases | Golden-path E2E |
| 11 | **Evaluation dry-run, bug bash, freeze** | | | Evaluation kit |

---

## 4. PR breakdown

Each PR stays reviewable (under about 600 changed lines where possible). Branches follow `team8/<feature>`.

1. `team8/f0-fix-build` · 2. `team8/f0-db-fixes` · 3. `team8/f0-ci-middleware-cleanup` · 4. `team8/f0-ui-kit`
5. `team8/f1-paymongo-checkout-webhook` · 6. `team8/f1-ledger-proofs`
7. `team8/f2-lifecycle` · 8. `team8/f2-availability-rpc` · 9. `team8/f2-cancellations`
10. `team8/f3-qr-tokens-verify` · 11. `team8/f3-checkin-roster`
12. `team8/f5-notifications` · 13. `team8/f5-web-push` · 14. `team8/f4-messaging`
15. `team8/f6-attractions` · 16. `team8/f6-maps-routes`
17. `team8/f7-itinerary-engine` · 18. `team8/f7-planner-ui` · 19. `team8/f7-llm`
20. `team8/f8-reviews` · 21–24. `team8/f9-{tourist,operator,guide,admin}-dashboard`
25. `team8/f10-rewards` · 26. `team8/f12-e2e-seed`

---

## 5. Traceability to the research instruments

| Instrument item | Feature(s) |
|---|---|
| SOP 1 #1 Up-to-date attraction info | F6 |
| SOP 1 #2 Manual multi-stop itineraries | F7, F6 |
| SOP 1 #3 Disorganized slot coordination | F2, F4 |
| SOP 1 #4 Last-minute changes | F2 cancellations, F4, F5 |
| SOP 1 #5 Verifying accreditation | F3 verify page |
| SOP 1 #6 Paper attendance logs | F3 check-in + roster |
| SOP 1 #7 No central ledger | F1 |
| SOP 1 #8 Reconciliation delays | F1 webhook, F9 revenue |
| ISO Functional Completeness | F9 |
| ISO Functional Correctness | F7 validator, F6 routes, F3 tokens |
| ISO Functional Appropriateness | F1, F4 |
| ISO Learnability / Operability | UI kit, F7 wizard, mobile tab bars |
| ISO User Error Protection | F2 capacity and dates, confirmations, validation that keeps input |
| ISO Aesthetics / Accessibility | F0 UI kit, F12 accessibility pass |
| Recommended future Security evaluation | F0 D6, F1 signatures, F3 HMAC, F12 RLS tests |

---

## 6. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Attraction data from the Tourism Office arrives late | Start collection in Week 2; ship F7a with a provisional 30-item dataset from public sources, clearly marked |
| Google Maps cost / quota | Server cache, matrix only for chosen candidates, Haversine fallback, budget alert |
| PayMongo sandbox webhooks can't reach localhost | Use a Vercel preview URL or a tunnel for testing; webhook logic unit-tested with recorded payloads |
| LLM output invalid or slow | Rule-based engine is the source of truth; LLM is optional, validated, timed out and cached |
| Schema drift between code and DB (caused D1/D2) | Generated types in F0; CI type-check; migrations only via PRs |
| Merge conflicts with other teams | Stay inside `tours/`; shared changes (`components/ui`, `lib/rewards`) go through Faculty Lead review |
| Evaluation-day failure | Week 11 dry-run with the evaluation script; seed reset script; offline-capable ticket QR |
