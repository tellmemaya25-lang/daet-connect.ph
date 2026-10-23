# Daet Tours Subsystem — Audit & Development Roadmap

_Audit date: 2026-10-23 · Base commit: `757dd94` (main, after PR #4)_

Scope: the **Daet Local Tour Operator and Itinerary Booking Platform** (Team 8, `src/app/(subsystems)/tours/`), measured against the capstone context document (SOP 1–4, Chapter 4.2–4.3, ISO/IEC 25010 evaluation form).

---

## 1. Health check results

| Check | Command | Result |
|---|---|---|
| Clean install | `npm ci` | ❌ **Fails** — `package-lock.json` out of sync (`@emnapi/wasi-threads` missing). Vercel/CI installs will break. |
| Unit tests | `npm test` | ⚠️ **483 / 488 pass** — 5 failures in 3 suites (details §3.3). |
| Typecheck | `npx tsc --noEmit` | ❌ **116 errors** (≈45 in app code, rest in tests). |
| Production build | `npx next build` | ❌ **Fails** — 6 × "Server Actions must be async functions" in `operator/packages/[id]/edit/actions.ts`. **`main` cannot deploy to Vercel right now.** |

---

## 2. Feature coverage vs. the context document

Legend: ✅ done · 🟡 partial · ❌ missing

### Role-based dashboards (Ch. 4.3 §3)

| Dashboard | Required features | Status |
|---|---|---|
| **Tourist** | Itinerary builder | ❌ |
| | Booking manager | 🟡 `my-bookings`, `bookings/[id]` exist; no cancel/reschedule |
| | Digital payment checkout | 🟡 GCash button + manual instructions; PayMongo flow is broken (§3.1) |
| **Operator** | Package management | ✅ create / edit / multi-step / gallery |
| | Booking approval | 🟡 status update + guide assignment; no state machine |
| | Revenue tracking | ❌ (manual `recordPayment` only, no ledger/report) |
| **Guide** | Schedule viewer | 🟡 `my-tours` list |
| | Client roster | ❌ |
| | QR check-in scanner | ❌ |
| **Admin** | Operator accreditation review | ✅ operators, guides, packages queues |
| | Municipal monitoring / aggregated analytics | ❌ |

### Core modules (SOP 2 & 3)

| Module | Status | Notes |
|---|---|---|
| Operator & guide accreditation | ✅ | Private docs, signed URLs, audit log events |
| Guide QR badge | 🟡 | QR holds a plain UUID — not signed/verifiable (§3.2) |
| Booking QR + check-in / attendance log | ❌ | No scanner, no `tours_checkins` table |
| Public "verify this guide/operator" page | ❌ | SOP 1 item 5 (x̄ = 3.51) |
| PayMongo sandbox checkout + webhook (`checkout_session.payment.paid`) | ❌ | No webhook route exists |
| Centralized payment ledger | 🟡 | `payment_status` / `total_paid` columns only |
| Daet tourism dataset (attractions, GPS, hours, dwell time, fees) | ❌ | No table, no seed |
| Google Maps routing (Routes API, polylines, distance matrix) | ❌ | Package stops store lat/lng only |
| AI-assisted itinerary scheduler | ❌ | |
| Real-time notifications (Supabase Realtime / FCM) | ❌ | |
| Rewards Engine (`addPoints`) | ❌ | `src/lib/rewards.ts` does not exist |
| CONNECT-Daet.ph shared schema sync (`profiles`, `impact_logs`) | 🟡 | `profiles` used; no impact log push |

### ISO 25010 "User Error Protection" items called out in the form

| Item | Status |
|---|---|
| Block invalid (past) dates | ✅ `booking-contract.ts:146` |
| Prevent double-booking | ❌ no uniqueness or capacity check on insert (`packages/[id]/book/actions.ts:105`) |
| Block incomplete forms | ✅ validation layers present |

---

## 3. Audit findings

### 3.1 Critical (fix before anything else)

1. **Build broken** — `operator/packages/[id]/edit/actions.ts` is a `"use server"` file that exports **sync** helpers (`requireEditablePackageStatus` at L331, plus L697, L794, L953, L1068, L1216). Next.js rejects this. Move pure helpers to a non-`"use server"` module (e.g. `edit/permissions.ts`, `edit/validation.ts` already exist).
2. **PayMongo client won't load** — `src/lib/paymongo/client.ts:1` uses a named import `{ PayMongo }`; the package has a default export. It also `throw`s at module load when the key is missing, crashing any page that imports it.
3. **PayMongo booking lookup always fails** — `src/lib/paymongo/actions.ts:28,36` reads `tourist_profile_id`; the table column is `user_id` (see `APPLY_THIS_booking_CLEAN.sql:23`).
4. **Client-controlled payment amount** — `paymongo/actions.ts:48` charges `input.amount` from the browser instead of `booking.total_amount − total_paid`. A tourist can pay ₱1 for an ₱8,500 tour.
5. **No payment webhook** — a booking can never become "paid" automatically, and there's no signature verification (`Paymongo-Signature` header) to stop forged callbacks.
6. **Lockfile out of sync** — `npm ci` fails; regenerate with `npm install` and commit.

### 3.2 High (security / integrity)

7. **QR codes are not tamper-proof** — `src/lib/tours/guide-qr.ts:8` encodes `CONNECT-DAET-GUIDE:<uuid>`. Anyone can generate a QR for any guide ID. The context doc requires JWT or HMAC-signed tokens. Use `HMAC-SHA256(secret, type|id|exp)` and verify on the server.
8. **Debug page shipped** — `operator/debug-profile/page.tsx` dumps `tours_operators.*` rows for any signed-in user. Delete it.
9. **No double-booking or capacity guard** — add `max_slots` per package/date and check it in a Postgres function inside a transaction (or a unique partial index), not in app code.
10. **`retrievePaymentIntent` has no auth check** (`paymongo/actions.ts:103`) — any caller can query any intent ID.
11. **`attachPaymentMethod` sends `client_key: ""`** (L83) — PayMongo will reject it. Switch to **Checkout Sessions**, which removes the need for client keys.
12. **No `middleware.ts` / session refresh** — `@supabase/ssr` needs middleware to refresh auth cookies; otherwise users get logged out at random and server actions see `user = null`.
13. **Operator booking actions don't check accreditation** — `operator/bookings/actions.ts` checks ownership but not `accreditation_status = 'approved'` (the README requires both).

### 3.3 Medium (correctness / maintainability)

14. **Package status type drift** — `PackageStatus` (`package-contract.ts:28`) omits `"rejected"`, but the edit flow and DB use it → several TS errors and dead branches (`edit/actions.ts:340`).
15. **5 failing tests:**
    - `package-validation.test.ts` "rejects NaN durationValue" — **real bug**: `NaN` passes validation.
    - `operator/actions.test.ts` — stale test, still expects `user_id` (code moved to `profile_id`).
    - `image-actions.test.ts` × 3 — tests and implementation disagree on error message, upload-path argument, and storage path format. Decide which side is right; fix the other.
16. **Image step components call actions with the wrong signature** — `CoverImageStep.tsx:82`, `GalleryStep.tsx:91,124` (1 arg vs 2; `.url` vs `.imageUrl`). Uploads in the edit flow likely fail at runtime.
17. **`gallery-schema-verification.ts:99,158,198`** — calls `.catch` on a Postgrest builder (not a Promise). Dead or broken diagnostic; remove it from `src/lib`.
18. **47 ad-hoc SQL files in `supabase/migrations/`** (`APPLY_THIS_*`, `FIX_*`, `DEBUG_*`, `CLEANUP_test_*`, duplicate `_CLEAN` / `_SIMPLE` / `_FIXED` variants). Nobody can rebuild the DB from scratch. Consolidate into one timestamped baseline migration plus `supabase/seed.sql`, and move the debug/check scripts to `supabase/scripts/`.
19. **Repo clutter** — ~15 status `.md` files and `test-*.txt` / `final-test-results.txt` in the root. Move the docs to `docs/`, delete the outputs, and add them to `.gitignore`.
20. **No generated DB types** — `supabase gen types typescript` would have caught #3 and #14 at compile time.
21. **Shared UI kit missing** — no `Button` / `Input` / `Modal` / `Card` in `src/components/ui/`, which the team guide requires.

---

## 4. Development roadmap

Each phase ends with green `npm ci && npm test && npx tsc --noEmit && npx next build`.

### Phase 0 — Stabilize (≈ 3–4 days) **← blocks everything**
- [ ] Fix build (#1): move sync exports out of `"use server"` files.
- [ ] Fix all non-test TS errors (#14, #16, #17); then fix test TS errors.
- [ ] Fix / update the 5 failing tests (#15), including the NaN validation bug.
- [ ] Regenerate the lockfile (#6). Add `.github/workflows/ci.yml` running install → typecheck → test → build on every PR.
- [ ] Add `src/middleware.ts` for Supabase session refresh (#12).
- [ ] Delete `debug-profile` (#8); clean the repo root (#19).
- [ ] Consolidate migrations plus `seed.sql` with test accounts for all 4 roles (#18); generate DB types (#20).
- [ ] Build `src/components/ui/{button,input,modal,card}.tsx` (#21).

### Phase 1 — Payments: PayMongo sandbox (≈ 1 week) — _SOP 1 item 7, highest pain (x̄ = 3.70)_
- [ ] Rewrite `lib/paymongo` around **Checkout Sessions** (`POST /v1/checkout_sessions`). The amount is computed server-side from the booking (#4), and `metadata.booking_id` is attached.
- [ ] `src/app/api/webhooks/paymongo/route.ts`: verify `Paymongo-Signature` (HMAC-SHA256 with the webhook secret, timestamp tolerance), handle `checkout_session.payment.paid`, and make it idempotent on the event ID.
- [ ] `tours_payments` ledger table (booking_id, provider, provider_ref, amount, status, raw_event, created_at); recompute `total_paid` from the ledger.
- [ ] Keep manual GCash/cash recording for operators, but write it to the same ledger (`provider = 'manual'`).
- [ ] Tests: webhook signature valid/invalid/replayed, amount tampering, duplicate events.

### Phase 2 — Booking integrity & lifecycle (≈ 1 week) — _SOP 1 items 3–4_
- [ ] Availability: `tours_package_schedules` (package_id, date, capacity). Book through an RPC `create_booking()` that locks the row and checks remaining slots (#9).
- [ ] Explicit state machine: `pending → confirmed → paid → checked_in → completed`, plus `cancelled` / `refunded`. Enforce allowed transitions in one function.
- [ ] Tourist cancel/reschedule with operator cutoff rules; operator accept/decline.
- [ ] Add the accreditation check to all operator actions (#13).

### Phase 3 — QR verification & check-in (≈ 1 week) — _SOP 1 items 5–6_
- [ ] `src/lib/qr-token.ts`: signed, expiring tokens (HMAC-SHA256 with `QR_SIGNING_SECRET`) for guide badges, operator badges and **booking tickets** (#7).
- [ ] Public `/tours/verify/[token]` page showing name, photo, accreditation status and validity date (no sensitive data).
- [ ] Guide **QR scanner** (`BarcodeDetector` API with `@zxing/browser` fallback) at `/tours/guide/check-in`. It validates the booking token, confirms the booking is for today and assigned to that guide, and writes `tours_checkins` (booking_id, guide_id, pax_present, scanned_at).
- [ ] Guide client roster per tour with check-in status (replaces paper logs).

### Phase 4 — Tourism dataset & Google Maps (≈ 1 week)
- [ ] `tours_attractions` table: name, category, lat/lng, opening/closing hours per weekday, dwell_minutes, entrance_fee, photo, source. Seed it from Daet Municipal Tourism Office data.
- [ ] Admin CRUD for attractions.
- [ ] Server-side Google Maps wrapper (`src/lib/maps.ts`): Routes API `computeRoutes` (polyline, distance in m, duration in s) and `computeRouteMatrix`. Cache results in `tours_route_cache` to control cost.
- [ ] Map component (Maps JS API) for package stops and itineraries. Use a key restricted by HTTP referrer for the browser and a separate server key.

### Phase 5 — AI-assisted itinerary scheduler (≈ 1.5 weeks)
Follow the context doc's "doable" guidance: **no custom ML training**.
- [ ] **5a. Heuristic engine first** (deterministic, testable, works offline): filter attractions by interests and budget → drop ones closed in the time window → greedy nearest-neighbour ordering on the cached distance matrix → time-block with dwell and travel time → output JSON `{days:[{blocks:[{attractionId,start,end,travelMinutes}]}]}`.
- [ ] **5b. LLM layer (optional)**: send the curated dataset plus preferences to an LLM with a strict JSON schema. **Validate the output with the same constraint checker as 5a** (opening hours, budget, existence of IDs) and fall back to 5a when it fails.
- [ ] Tourist UI at `/tours/plan`: budget, days, interests → time-blocked schedule on the map → "book matching packages" suggestions → save to `tours_itineraries`.
- [ ] Unit tests for the constraint checker, using property-based tests (fast-check is already installed).

### Phase 6 — Real-time notifications (≈ 4 days)
- [ ] `notifications` table (profile_id, type, payload, read_at) with RLS so users see only their own rows.
- [ ] Supabase Realtime `postgres_changes` subscription in a header bell component.
- [ ] Emit on: booking created/confirmed/cancelled, payment received, guide assigned, accreditation approved/rejected.

### Phase 7 — Dashboard completion (≈ 1 week)
- [ ] Tourist: home with upcoming trips, itineraries, payments, tickets (QR).
- [ ] Operator: revenue report from the ledger (by month / package), booking calendar.
- [ ] Guide: schedule calendar plus roster plus scanner entry point.
- [ ] Admin: municipal analytics (arrivals per day, bookings per operator, revenue, check-ins, top attractions). Push aggregates to CONNECT-Daet `impact_logs`.

### Phase 8 — CONNECT-Daet integration (≈ 2 days)
- [ ] Create `src/lib/rewards.ts` (`addPoints`) if Faculty Leads haven't, or consume theirs. Award points on paid booking, check-in and completed tour.
- [ ] Document the shared-table contract (`profiles`, `impact_logs`) for Chapter 4.2 §3.

### Phase 9 — Testing & evaluation readiness (≈ 1 week, overlaps)
- [ ] Playwright e2e for the full evaluator walkthrough: tourist plans → books → pays (sandbox) → webhook confirms → guide scans QR → admin sees analytics.
- [ ] Seed "evaluation mode" accounts for all 4 roles with sandbox money (context doc SOP 4 safeguard).
- [ ] Mobile pass at 375 px: 44 px touch targets, `rounded-2xl` cards, `rounded-full` primary buttons.
- [ ] Accessibility pass (labels, contrast, focus) for the ISO 25010 Accessibility item.
- [ ] Security checklist for the recommended future ISO 25010 Security evaluation: RLS review per table, webhook signature, QR signature, no service-role key in the client bundle.

**Rough total: 9–10 weeks** for one team, or ~6 weeks if Phases 3/4 and 6/7 run in parallel.

---

## 5. Suggested order of PRs

1. `team8/fix-build-and-tests` (Phase 0, items #1, #6, #14–17)
2. `team8/middleware-and-cleanup` (#8, #12, #18–20)
3. `team8/paymongo-checkout-webhook` (Phase 1)
4. `team8/booking-capacity` (Phase 2)
5. `team8/signed-qr-checkin` (Phase 3)
6. `team8/attractions-maps` (Phase 4)
7. `team8/itinerary-planner` (Phase 5)
8. `team8/notifications`, `team8/dashboards`, `team8/rewards` (Phases 6–8)
