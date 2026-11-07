# CONNECT-DAET User Guide — Feature Coverage & Screenshot Checklist

Use this checklist to plan the screenshots and step-by-step instructions for the four user roles. It reflects the current routes and role workflows in the app. It is a **capture plan**, not a claim that every screenshot has already been taken.

## 1. Corrections to the sample outline

- **Account creation is shared; staff applications are separate.** Capture `/login` and `/signup` once for the whole guide, not once per role. `/signup` creates the base account; it is not a separate operator/guide role-registration form. After signing in, operator and guide applicants use `/tours/operator/register` and `/tours/guide/register` for accreditation. Email confirmation is required to activate a new account; password-reset screenshots are optional unless the guide covers account recovery.
- **Tourists use “Plan a trip,” not an “AI Itinerary Generator” dashboard tab.** The planner is at `/tours/plan`. It asks for trip dates, group details and origin when needed; interests, budget and pace can be read from the traveller's request. Do not describe it as a fixed “destination / number of days / budget” form unless the screen being documented actually shows those fields.
- **A booking request is not immediately payable.** The operator first confirms or declines it. Show the pending/waiting state before the confirmed booking's payment options. PayMongo may be configured; manual payment proof is a separate flow.
- **A tourist ticket QR is only ready after full payment.** The guide's QR badge is a different QR used to verify guide accreditation. Do not confuse the two.
- **There is no general “User Management” approval table.** Admin reviews Operator applications, Guide applications and Packages in separate sections. Use the implemented labels/routes.
- **Package rejection is not exposed by the current Admin status selector.** The package detail form offers Draft, Pending Review, Published and Archived plus optional notes/Quick Approve; it has no Rejected option. The operator editor can display a rejection reason and resubmission action for a rejected record, but do not document an Admin reject flow as working unless the UI is updated.
- **Admin Analytics is not a live or formal “Tourism Impact Assessment Report.”** It has date-range operational analytics; the app does not generate a dedicated impact-assessment report.
- **“Operator to Guide” is mediated by CONNECT-DAET.** The operator assigns the guide in the booking workflow; the platform notifies the guide, who opens the authorized guest roster. Do not imply an unrestricted direct file transfer.

## 2. Before capturing

- Use the synthetic E2E/staging fixture and PayMongo **test** mode. Do not capture real visitor, guide, operator, child, payment, or location data.
- Blur or use synthetic values for email, phone number, booking reference, guest names/ages, receipts, IDs, account/bank details, precise location, and QR codes. Never publish an actual guide ID or a scannable production ticket/badge.
- For the main workflows, capture one desktop view (about 1440 px) and one phone view (about 390 px). For genuinely multi-step forms, one focused screenshot per distinct step/state is more useful than one very long full-page capture. For a long single-page form, capture its labeled sections without calling them steps.
- Keep enough context to identify the page and role: page heading, active tab, important status, and the button/field being explained. Crop out browser chrome and unrelated blank space, not the status or instructions.
- Capture states with different meanings separately: pending vs confirmed, unpaid vs paid, submitted vs approved, and first check-in vs already checked in.
- Suggested names: `tourist-04-booking-pending-390.png`, `operator-08-receipt-review-1440.png`, `guide-06-checkin-result-390.png`, `admin-03-guide-review-1440.png`.

## 3. Screenshots already present in this workspace

These files already exist under `docs/screenshots/role-guides/`. Their names suggest useful baseline views; **open and verify the contents and fixture state** before reusing them in the final guide. Confirm that any personal, booking, payment, and location data are synthetic or redacted; do not assume an existing screenshot is safe to publish.

- Tourist: `tourist-home-390.png`, `tourist-home-1440.png`
- Operator: `operator-home-390.png`, `operator-home-1440.png`, `operator-calendar-390.png`
- Guide: `guide-home-390.png`, `guide-home-1440.png`, `guide-availability-390.png`, `guide-badge-390.png`, `guide-badge-1440.png`
- Admin: `admin-home-390.png`, `admin-home-1440.png`, `admin-analytics-390.png`, `admin-analytics-1440.png`

These cover some dashboards, calendars, availability, the guide badge, and analytics. They do **not** cover all of the task flows below. In particular, the badge QR in the E2E screenshot uses a test-only signing secret and is not valid as a real accreditation credential.

## 4. Common account and navigation captures

Capture once and refer to these from each role section:

- [ ] `/login`: shared sign-in screen; show the role-neutral form and the correct “Sign in” action.
- [ ] `/signup`: shared account creation screen and successful “check your email” state, then `/verify-email` and the verified/resend state; email confirmation is required before sign-in.
- [ ] Optional account-recovery flow: `/forgot-password` and `/reset-password`.
- [ ] `/settings`: profile settings, only if the guide explains changing the user's name/avatar or password.
- [ ] Shared header: notification bell and account menu. On mobile, show the role's actual bottom tabs and the **You** account tab where applicable.
- [ ] `/tours/notifications`: in-app notification list with a synthetic booking/payment/assignment update and read/unread state.

Current mobile role tabs are:

| Role | Mobile tabs |
|---|---|
| Tourist | Home, Plan, Bookings, Messages, You/account |
| Tour Operator | Home, Bookings, Packages, Revenue, Messages |
| Tour Guide | Home, Tours, Scan, Badge, Messages |
| Admin | Home, Analytics, Approvals, Content, Messages |

On desktop, tourist navigation includes Plan a trip, Trips, Places, Events and Souvenirs. Staff use role-specific work links; staff do not get the tourist Explore menu.

## 5. Tourist — capture the full visitor journey

Routes: `/tours/me`, `/tours/browse`, `/tours/packages/[id]`, `/tours/packages/[id]/book`, `/tours/plan`, `/tours/my-itineraries`, `/tours/my-bookings`, `/tours/bookings/[id]`, `/tours/bookings/[id]/ticket`, `/tours/messages`, `/tours/messages/ai`, `/tours/notifications`.

### Discovery and planning

- [ ] **Find a trip** — `/tours/browse`: search/filter controls, price ordering, and a sample published package card. Show the actual controls present; do not invent filters.
- [ ] **Trip details** — `/tours/packages/[id]`: price/variant, meeting point/directions, stop-by-stop route, inclusions and exclusions, operator accreditation, and traveller reviews. Include the Book this trip action.
- [ ] **Planner start and questions** — `/tours/plan`: “Where to in Daet?”, message box, Dates/Travelers chips, the “Recents” link, and “Try asking” examples; when details are missing, show “Before I draft” with dates or “No dates yet, show me a sample plan,” adults/children (including each child's age), travelling-from options, and “Draft my plan.” Interests, budget and pace can come from the traveller's free-text request; the app does not always show them as fixed form fields.
- [ ] **Generated plan** — show day-by-day stops, “All days” / day selection, each stop's estimated time/travel and entrance fee for the group, any listed “Getting there” fare card, route map, bookable tour links, and “Regenerate.” If using a sample plan, show “Sample plan, no dates yet” and “Pick dates to save”; tours in the plan are booked and paid for separately. Explain that the rule engine uses database listings; Gemini is optional and a basic-mode plan remains available.
- [ ] **Edit and save a plan** — demonstrate Edit, reorder/add/remove/swap a stop, pace or travel-mode choices, and Undo where useful. Saving to My itineraries requires sign-in; show the saved plan, “Share a view-only link,” and the automatic “Saved on this phone” offline status on the saved-plan page if documenting those features.
- [ ] **Assistant Q&A** — `/tours/help` or `/tours/messages/ai`: one Daet question, helpful/not-helpful feedback, and the link that opens the planner for a plan request. Make clear the assistant does not place or confirm a booking.

### Booking, payment, ticket and after-trip

- [ ] **Booking form** — `/tours/packages/[id]/book`: operator-open date, price option when more than one is offered, number of guests, lead contact full name/email/phone, optional special requests, and calculated total. The current form does not ask for each guest's name or age.
- [ ] **Request submitted / pending** — `/tours/bookings/[id]`: booking reference and “waiting for operator” status. Include the instruction not to pay before confirmation.
- [ ] **Confirmed booking / payment panel** — capture the confirmed state and remaining balance. If PayMongo is enabled, capture the test checkout handoff. If manual payment is enabled, capture payment instructions and proof upload.
- [ ] **Manual proof result** — if the guide covers manual receipts, capture pending review and one rejection/verification state with synthetic information. Do not show an actual receipt or account number.
- [ ] **My bookings** — `/tours/my-bookings`: upcoming/past list and distinct pending, confirmed, paid/unpaid, cancelled or completed badges that appear in the chosen fixture.
- [ ] **Ticket QR** — `/tours/bookings/[id]/ticket`: fully-paid ticket, booking reference, date, guest count and lead contact, “Print ticket,” and the automatic offline-saved status if it appears; saving is not a user toggle. Optionally capture the unpaid “ticket not ready” state separately. Use an E2E QR and do not publish a real scannable guest ticket.
- [ ] **Cancellation and operator call-off** — show the tourist's cancellation request and outcome; separately show the operator-initiated call-off notice and the tourist's new-date or refund choice, if these flows are part of the guide.
- [ ] **Review and rewards** — completed booking review form and the resulting points/rewards view on the tourist home page.
- [ ] **Messages and live-tour privacy** — booking conversation with operator/guide; near the tour date, the location-sharing choices and live-map state. Use synthetic location and explain sharing is opt-in for tourists.

### Other public/traveller features to include if the guide claims full coverage

- [ ] `/tours/attractions` and attraction detail, including the route/assistant entry point.
- [ ] `/tours/events` calendar and an event detail.
- [ ] `/tours/merch` souvenir showcase. It is a showcase/contact flow, not an in-app merchandise checkout.
- [ ] `/tours/faq` or `/tours/help`, including emergency numbers and “check before you go” caveats where shown.
- [ ] Shared-itinerary view at `/tours/itineraries/shared/[token]` if the guide covers sharing.

## 6. Tour Operator — capture the business and booking lifecycle

Routes: `/tours/operator/register`, `/tours/operator/pending`, `/tours/operator/dashboard`, `/tours/operator/packages`, `/tours/operator/packages/create`, `/tours/operator/packages/[id]/edit`, `/tours/operator/packages/[id]/availability`, `/tours/operator/bookings`, `/tours/operator/payments`, `/tours/operator/settings`, `/tours/operator/live`, `/tours/operator/reviews`, `/tours/operator/merch`, `/tours/operator/merch/new`, `/tours/operator/merch/[id]/edit`, `/tours/messages`.

- [ ] **Apply / accreditation status** — operator business registration form and pending or approved state. Do not reuse an Admin ID-review screenshot as a public guide image.
- [ ] **Dashboard** — existing `operator-home-390.png` / `operator-home-1440.png`: “Waiting for you” / bookings-to-confirm link, “Received in this month,” “Occupancy,” “Rating,” “Tours by date,” “Today's tours,” “Revenue by package,” and “Contact Tourism Office.” Verify the fixture before reusing.
- [ ] **Packages list** — statuses (draft/pending review/published/rejected/archived where applicable) and entry point to create/edit/availability.
- [ ] **Create a package** — `/tours/operator/packages/create` is one long “New tour package” form, not a wizard. Capture its labeled sections (or focused crops):
  - [ ] “Basic Details” — package title, description, location and duration.
  - [ ] “What's Included” — included items and optional exclusions.
  - [ ] “Pricing” — price per person and minimum pax; the create form starts with one Standard Rate.
  - [ ] “Itinerary” — tour stops, entered one per line.
  - [ ] “Package Images” — optional cover image and gallery.
  - [ ] “Submit for Review” result. If the app saves it as a draft instead, capture the editor/draft state and explain the next action; the create page does not have a separate Save draft button.
- [ ] **Edit a package** — `/tours/operator/packages/[id]/edit` is the separate editor with Basic Details, Cover Image, Price Variants, Inclusions & Exclusions, Tour Stops and Gallery sections. Show a representative edit plus the actual available “Save as Draft,” “Submit for Review,” or “Save changes” action for that package's status; published-package saves affect the live listing.
- [ ] **Moderation result** — show submission for review and the approved/published result; a submitted package is not automatically public. Only capture an operator “Rejected”/resubmission state if the fixture already has one, and explain the current Admin status-selector limitation noted above rather than presenting rejection as a working Admin action.
- [ ] **Dates & seats** — `/tours/operator/packages/[id]/availability`: add open dates and capacity; show the saved dates/seats list. Existing `operator-calendar-390.png` may cover part of the dashboard calendar, not necessarily this package-specific manager.
- [ ] **Booking management** — `/tours/operator/bookings`: “All,” “To confirm,” “Confirmed,” “Completed” and “Declined” filters, then a booking card with date, guest count, lead contact/special request, amount/payment status, and action buttons. Capture pending → confirm/decline and the resulting status; show “Mark as completed” on or after the tour date before documenting a tourist review. This page does not display per-guest names.
- [ ] **Guide assignment** — assigned-guide selector / availability, guide-assigned result, and any pending swap request with operator approve/decline action. The system notifies the guide and tourist.
- [ ] **Manual receipt review** — proof awaiting review, and approve/reject with a reason. Do not include real GCash/bank details or a real uploaded receipt.
- [ ] **Cancellation / refunds / call-off** — tourist cancellation request decision; record refund after payment is actually sent; operator call-off reason and resulting tourist/guide notice.
- [ ] **Revenue & payments** — `/tours/operator/payments`: monthly received ledger, revenue by package, previous/next month, and CSV download. Do not label this a payout or net-profit report unless the page says so.
- [ ] **Payment settings** — `/tours/operator/settings`: business contact details and configured payment instructions. Mask bank/account numbers in the capture.
- [ ] **Live operations** — `/tours/operator/live` and a tour detail: assigned live session, guest/map status, and end-live-sharing control where enabled.
- [ ] **Reviews, merchandise and communication** — reply to a traveller review; on `/tours/operator/merch`, show Pending/Approved/Rejected status and any rejection note, plus product creation/edit/resubmission. Editing an approved operator product sends it for review again. Also capture an in-app message to a tourist/guide/Admin, notification bell, and an alert.
- [ ] **Profile settings** — shared `/settings` if the guide covers profile updates.

## 7. Tour Guide — capture accreditation, schedule, roster and check-in

Routes: `/tours/guide/register`, `/tours/guide/pending`, `/tours/guide/dashboard`, `/tours/guide/my-tours`, `/tours/guide/check-in`, `/tours/guide/my-qr`, `/tours/verify/[token]` (public badge verification), `/tours/guide/tours/[bookingId]/roster`, `/tours/guide/tours/[bookingId]/live`, `/tours/messages`.

- [ ] **Apply as a guide** — registration/profile and identity-verification consent. Never show a real government ID, full ID number, or private storage link; use a synthetic/redacted image only.
- [ ] **Pending / approved status** — explain that the guide role and its protected tools are available only after approval.
- [ ] **Dashboard and availability** — existing `guide-home-390.png`, `guide-home-1440.png`, `guide-availability-390.png`: Today / Next tours plus the availability calendar and save result. Verify contents. Marking unavailable can be blocked on a day with an active booking.
- [ ] **My tours** — `/tours/guide/my-tours`: today, upcoming and completed groups; show an assigned tour and the “Guest list” / “Scan tickets” entry points.
- [ ] **Guest roster** — `/tours/guide/tours/[bookingId]/roster`: booking party size and special requests, guest names/requirements and individual check-in if they are present, plus check-in status and contact/message actions. The current tourist booking form collects a guest count, not each guest's name; capture the roster's whole-party fallback when no participant names are available.
- [ ] **QR scanner** — `/tours/guide/check-in`: camera permission, scanner, a successful test scan, and a rejected/expired/already-checked-in result where the fixture supports it. If in-browser scanning is unavailable, show the phone-camera link or “Or paste the ticket link or code” fallback. Only scan a synthetic ticket; guide badges are not booking tickets.
- [ ] **Manual check-in** — roster fallback for the whole group or one named guest; show success/already result. Check-in is limited by caller role, guide assignment, booking state, payment state and tour date.
- [ ] **Guide badge / public verification** — actual page label “My QR Code” at `/tours/guide/my-qr`, plus `/tours/verify/[token]` if showing what a public scan returns: badge and verification status/expiry. Existing `guide-badge-390.png` / `guide-badge-1440.png` may help, but label the QR as an E2E sample; it is not a valid real credential.
- [ ] **Schedule swap** — request a replacement guide, reason, pending state, and operator decision if available in the fixture.
- [ ] **Live tour** — `/tours/guide/tours/[bookingId]/live`: Start live tour, location permission/status, map, stops/“Arrived at stop,” and End tour/stop sharing. Use a synthetic booking and location.
- [ ] **Messaging and call-off** — message operator/tourist, receive a call-off or assignment notification, and show the updated tour state.
- [ ] **Profile and notification bell** — shared `/settings` and `/tours/notifications` if included.

## 8. Admin / Tourism Office — capture separate queues and content tools

Routes: `/tours/admin`, `/tours/admin/analytics`, `/tours/admin/operators`, `/tours/admin/guides`, `/tours/admin/packages`, `/tours/admin/merch`, `/tours/admin/attractions`, `/tours/admin/events`, `/tours/admin/fares`, `/tours/admin/guide-places`, `/tours/admin/emergency`, `/tours/admin/reviews`, `/tours/admin/feedback`, `/tours/messages`.

- [ ] **Admin dashboard** — existing `admin-home-390.png` / `admin-home-1440.png`: Operators to review, Guides to verify, Packages to approve, published packages, bookings count, management links and recent audit activity.
- [ ] **Operator applications** — `/tours/admin/operators`: queue, applicant detail, reviewed documents via authorized short-lived view, approve/reject and required review outcome. Do not capture the private ID/business files themselves.
- [ ] **Guide applications** — `/tours/admin/guides`: separate queue, public profile vs private identity review, approve/reject and badge state. Do not capture raw IDs or their temporary private links.
- [ ] **Package moderation** — `/tours/admin/packages` shows separate “Pending Approval,” “Published” and, when present, “Archived” sections (not filter chips). At `/tours/admin/packages/[id]`, capture the “Review & Update Status” selector (Draft, Pending Review, Published, Archived), optional “Admin Notes,” and “Quick Approve.” The current selector has no Rejected option; do not show notes as a rejection reason or imply a supported reject action. The operator editor can display a rejection reason/resubmit state only if that record already exists.
- [ ] **Merchandise moderation** — `/tours/admin/merch`: “All” / “Waiting for approval” tabs, submission status, and approve/reject controls with a note required for rejection. An operator's edit to an approved product sends it back for review; capture that state only if documenting the resubmission path.
- [ ] **Tourism-office content** — capture the management screens that are in scope for the guide:
  - [ ] Attractions: list, map-pin/verification state, add/edit/import.
  - [ ] “Events calendar”: admin event list with Published/Draft/Past labels, “+ New event,” and Edit. The actual month calendar is on the public `/tours/events` page.
  - [ ] Fares and travel times: list and fare add/edit/import.
  - [ ] Local guide places (food/stays): list/filter and place add/edit/import.
  - [ ] Emergency numbers: list, last-checked date, “Checked today” action, and “Add a number” form (the current screen has no edit action).
- [ ] **Review moderation** — `/tours/admin/reviews`: “All,” “1–2 stars” and “Hidden” filters; “Hide review” with its reason field or “Show again” for hidden reviews. Capture the public-hidden result without exposing identifiable user details.
- [ ] **Assistant feedback** — `/tours/admin/feedback`: “Not helpful,” “Helpful” and “All” tabs, 30-day Yes/No counts, and each feedback row's question/answer, “AI answer” or “Simple answer” label, date and page. No visitor names are kept; use synthetic examples.
- [ ] **Analytics** — existing `admin-analytics-390.png` / `admin-analytics-1440.png`: include one range selection and the metrics actually shown: tourist check-ins, bookings/confirmed pax, revenue received, cancellation rate, arrivals/check-ins by day, revenue by operator, top packages, top attractions in saved trip plans, rating distribution, accreditation queue. Capture a custom date range only if you explain that feature. Do not call it “real-time” unless you verify the page's refresh behavior.
- [ ] **Messages, notifications and audit** — Admin conversation/inbox, notification bell, and recent activity/audit row if these are part of the guide.
- [ ] **Profile settings** — shared `/settings` if needed.

## 9. Minimum end-to-end screenshot story

If time is limited, prioritize one synthetic booking and capture the linked states in this order:

1. Tourist browses a package and sends a booking request → pending/waiting state.
2. Operator opens the booking, confirms it, and assigns an approved/available guide.
3. Tourist sees confirmation and payment options; use PayMongo test checkout or a synthetic manual-proof flow.
4. Guide receives the assignment alert, opens the authorized roster, scans a synthetic ticket or checks in from the roster.
5. Tourist opens the paid ticket; the guide sees the recorded check-in in the roster; on or after the tour date, the operator marks the booking completed, enabling the tourist's review.
6. Admin Analytics shows aggregate check-in/booking/payment metrics for a chosen range.

This sequence demonstrates the actual handoffs without claiming a direct operator-to-guide transfer or skipping the operator confirmation step.
