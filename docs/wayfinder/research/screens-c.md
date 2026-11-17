# Admin screens C: Fares, Merch, Dashboard, Analytics

Base dir: `src/app/(subsystems)/tours/admin/` (abbrev. `A/`). Libs under `src/lib/tours/`, components under `src/components/`.

## Shared behaviour
- Auth: Fares and Merch pages call `requirePromoAdmin()` (`lib/tours/promo-admin.ts`). If not admin they render `PromoAdminDenied` (Notice error "Admin access required" + message + "Sign in" link to `/login?next=...`). Messages: "Please sign in with a Tourism Office admin account." / "Only Tourism Office admins can manage this content."
- Heading: `AdminPageHeading` (`components/tours/promo-admin-denied.tsx`): back link "← label", H1, optional blue pill action button.
- All pages use `PageFrame adminNav`, `force-dynamic`.
- List pages show flash notices from query params: `?saved=1` ("X saved."), `?deleted=1` ("X deleted."), `?error=...` ("That action could not be completed."), plus a load-error Notice.
- Forms: `usePromoForm(action)` returns `{state,pending,onSubmit}`; state is `{message, errors{field:msg}}`. Top Notice error shows `state.message`; per-field errors through `PromoField`. `noValidate` form (server validation only; `required`/`maxLength` attrs are still set). Submit button shows "Saving…" while pending. Cancel link returns to list. Success = server `redirect(list?saved=1)`.
- Delete: `ConfirmSubmitButton` (browser-confirm style message) inside a form posting hidden `id`.

## 1. Fares (`A/fares/`)

### List: `fares/page.tsx`
- Layout: card-row list (not a table). Title "Fares and travel times"; back to `/tours/admin/guide-places` ("Local guide places"); action "+ New fare". Intro text: assistant uses these for directions/cost estimates and joins routes sharing a stop.
- Data: `tours_fares` select `FARE_COLUMNS`, order `from_name` then `to_name`, limit 500. No filters, search, sort controls or pagination.
- Row content: bold "`from_name` to `to_name`"; subline joined with " · ": mode label, fare label (`fareLabel`: "₱lo–₱hi per person" or single value, else "Fare unknown"), minutes label (`minutesLabel`, e.g. "45 min", "1–2 h", "50 min to 1 h 10 min"; omitted if null).
- Badges: `Verified` (success) or `Verify locally` (warning); `Hidden` (neutral) if `!is_active`.
- Row actions: Edit (link `/tours/admin/fares/{id}/edit`); Delete (confirm: "Delete the {mode} fare from X to Y?" -> `deleteFare`).
- Bulk: "Import from a spreadsheet" card with `CsvImportForm` (`importFaresCsv`); columns `mode, from, to, fare_min, fare_max, fare_per, minutes_min, minutes_max, schedule_note, source, checked_on`; required `mode, from, to, source`; downloadable template `fares-template.csv`.
- Empty: "No fares yet. Add one or import a spreadsheet." Error: "Fares could not be loaded."
- Mode labels (`lib/tours/guide/fares.ts`): bus=Bus, van=Van (UV Express), jeepney=Jeepney, tricycle=Tricycle, boat=Boat, habal_habal=Habal-habal, taxi=Taxi, plane=Plane. Fare-per: person="per person", trip="per trip", boat="per boat".

### New/Edit: `fares/new/page.tsx`, `fares/[id]/edit/page.tsx`, `fares/fare-form.tsx`
- Edit: 404 (`notFound`) if id not a UUID or row missing. Titles "New fare"/"Edit fare", back "All fares". Submit label "Add fare" / "Save changes".
- Fields (validation in `validateFare`, `lib/tours/guide/fares.ts`; form parse `parseFareForm` in `lib/tours/guide/csv.ts`):

| Field (name) | Type | Req | Validation / error text |
|---|---|---|---|
| How people travel (`mode`) | select, default tricycle | yes | must be a FARE_MODES key: "Choose how people travel." |
| From (`fromName`) | text max 80 | yes | 2-80 chars: "Enter where the ride starts (2 to 80 characters)." hint "e.g. Daet town center, Paracale port" |
| To (`toName`) | text max 80 | yes | 2-80: "Enter where it ends (2 to 80 characters)." |
| Fare From (₱) (`fareMin`) | text, decimal | no | strips leading ₱ and commas; `^\d+(\.\d{1,2})?$`: "Enter pesos, e.g. 30." |
| Up to (₱) (`fareMax`) | text, decimal | no | same; defaults to fareMin if blank; max < min: "The highest fare must not be below the lowest." |
| Fare is (`farePer`) | select person/trip/boat, default person | no | "Choose per person, per trip or per boat." Fieldset hint: leave empty if unknown; assistant then says to ask locally |
| Shortest trip min (`minutesMin`) | text, numeric | no | integer 1-2000: "Enter whole minutes, e.g. 45." |
| Longest trip min (`minutesMax`) | text, numeric | no | same; defaults to min; "The longest time must not be below the shortest." |
| Schedule and tips (`scheduleNote`) | textarea 2 rows, max 300 | no | "Keep this under 300 characters." |
| Source (`source`) | text max 500 | yes | 3-500: "Say where this information comes from." |
| Checked on (`checkedOn`) | date | no | defaults to today (Manila); must match YYYY-MM-DD: "Use a date like 2026-10-29." |
| Verified by the Tourism Office (`verified`) | checkbox, default false | no | desc: unverified fares show "verify locally" note |
| Show to travellers (`isActive`) | checkbox, default true | no | |

- Actions (`fares/actions.ts`): `saveFare` insert/update `tours_fares`; unique violation (23505): message "This way of travel on this route is already listed. Edit that fare instead." + field error on mode; other error: "The fare could not be saved. Please try again." Auth fail returns the admin error as message. `deleteFare` redirects `?deleted=1` or `?error=delete`/`unauthorized`. `importFaresCsv`: file required ("Choose a CSV file."), max 1 MB, max 300 rows, all-or-nothing validation ("Nothing was imported. Fix N row(s)..." with per-line errors), skips existing mode+from+to (case-insensitive) -> "Imported N fare(s). Skipped M already listed."
- Edge: DB also has `board_place_id` (not editable in form).

## 2. Souvenirs / Merchandise (`A/merch/`)

### List: `merch/page.tsx`
- Title "Merchandise"; back "Admin dashboard"; action "+ Add product". Data: `tours_merchandise` select `MERCH_SUBMISSION_COLUMNS` + `tours_operators(business_name)`, order `created_at` desc, limit 200.
- Filter: pill tabs via `?show=`: "All" and "Waiting for approval (N)" (`show=pending` filters `review_status = pending`; N is a separate count query). No search or sort.
- Row (card list): 64px thumbnail (image or bag icon); chips: category label, `Visible` (green) / `Hidden` (yellow), `★ Featured`, and for operator submissions a review chip "{label} · {operator business name}" (pending=yellow, rejected=red, approved=sky). Then bold name (truncated) and "₱price or 'Ask seller' · seller_name".
- Row actions: inline `MerchReviewForm` only when operator-submitted and pending: note input (max 300, placeholder "Note (needed to reject)", sr-only label "Note to the operator"), buttons Approve (loading state) and Reject (danger); error shown as Notice. Plus Edit link, Delete (confirm: `Delete "{name}"? This cannot be undone.`).
- Categories (`lib/tours/promo-validation.ts`): tshirt=T-shirts, mug=Mugs, souvenir=Souvenirs, accessory=Accessories, pasalubong=Pasalubong, other=Other.
- Review statuses `MERCH_REVIEW_LABELS`: pending="Waiting for approval", approved="Approved", rejected="Not approved".
- Empty: bag icon, "No products yet", "Advertise local t-shirts, mugs, souvenirs and pasalubong." (shown for filtered-empty too). Error: "Products could not be loaded. Has the merchandise migration been applied?"

### New/Edit: `merch/new/page.tsx`, `merch/[id]/edit/page.tsx`, `merch/merch-form.tsx`
- Titles "Add product"/"Edit product", back "All products". Edit: `notFound` if missing (no UUID pre-check). Same form is reused by operators (`mode="operator"`, custom action): label "Show once approved", no Featured checkbox, info Notice "The Tourism Office reviews every product before it appears on the merch showcase. Editing an approved product sends it for review again.", submit "Submit for approval"/"Save and resubmit". Admin submit: "Add product"/"Save changes".
- Fields (`parseMerchForm`, `promo-validation.ts`):

| Field (name) | Type | Req | Validation |
|---|---|---|---|
| Product name (`name`) | text max 120, placeholder "e.g. I ♥ Daet T-shirt" | yes | 2-120 |
| Category (`category`) | select, default tshirt | yes | "Choose a product category." |
| Price ₱ (`price`) | text, decimal | no | `^\d{1,8}(\.\d{1,2})?$`: "Enter a price in pesos, e.g. 350 or 349.50."; blank = "Ask seller" |
| Seller / shop name (`sellerName`) | text max 120 | yes | 2-120 |
| Where to buy (`whereToBuy`) | text max 200 | no | 0-200 |
| Contact (`contactInfo`) | text max 200; hint phone/Facebook/website | no | 0-200 |
| Description (`description`) | textarea 4 rows max 1000 | no | 0-1000 |
| Image (`image`) | file jpg/png/webp (`PromoImageField`), shows current thumb + "Remove current image" checkbox (`removeImage`) | no | "Image must be a JPG, PNG, or WebP file." / "Image must be 5 MB or smaller." |
| Show in the merchandise section (`isActive`) | checkbox, default true | no | |
| Feature on the home page (`isFeatured`) | checkbox, default false (admin only) | no | |

- Actions (`merch/actions.ts`): `saveMerch` uploads image to bucket `tours-promo-images` under `merch/`, deletes replaced/removed image, rolls back upload on DB error; errors "This product no longer exists." and "The product could not be saved. Please try again."; inserts with `created_by`. `deleteMerch` removes row and image. `reviewMerch` (via `parseMerchReview`): approve needs nothing; reject needs note >= 3 chars ("Tell the operator what to change."); note max 300; only updates rows with `submitted_by_operator_id` not null; error "The decision could not be saved."; DB notifies the operator. Revalidates `/`, `/tours/merch`, `/tours/admin/merch`, `/tours/operator/merch`.

## 3. Admin Dashboard (`A/page.tsx`)
- Gate (inline, not `requirePromoAdmin`): no user -> info Notice "Admin sign-in required" with sign-in link; `profiles.role !== 'admin'` -> error Notice "Access denied: Only Tourism Office admins can access this dashboard."
- Header: H1 "Tourism Office", "Welcome back, {full_name or 'Admin'}".
- Stat cards (5, head-count queries, `|| 0` fallbacks; no per-query error UI):

| Card | Source | Link | Caption |
|---|---|---|---|
| Pending Operators | `tours_operators` accreditation_status=pending | /tours/admin/operators | Applications awaiting review |
| Pending Guides | `tours_guides` accreditation_status=pending | /tours/admin/guides | Guide applications to verify |
| Pending Packages | `tours_packages` status=pending_review | /tours/admin/packages | Tour packages awaiting approval |
| Published Packages | `tours_packages` status=published | none | Active tour offerings |
| Total Bookings | `tours_bookings` all | none | All-time reservations |

- Quick Actions (11 pill links): Tourism Analytics, Review Operators, Review Guides, Review Packages, Manage Events Calendar, Manage Attractions, "Local guide: food, stays, fares" (`/tours/admin/guide-places`), Moderate Reviews, Operator Messages (`/tours/messages`), Manage Merchandise. No direct Fares link (reached via guide-places).
- Recent Activity: last 5 rows of `tours_admin_audit_log` joined to `profiles!inner(full_name)`, newest first; shows icon glyph, "{admin} {description}", locale timestamp, optional italic notes. Actions mapped: approve/reject_operator|guide, update_package_status ("changed package status to {new_value}"), delete_package, ban_user, unban_user; default "performed an action". Section is hidden entirely when there are no rows (no empty state). Note: `!inner` join drops rows with no profile.
- No charts, filters, or date range on this page.

## 4. Analytics (`A/analytics/page.tsx`)
- Gate: `requirePromoAdmin` -> `PromoAdminDenied`. Title "Analytics", back "Admin dashboard". Metadata title "Tourism analytics".
- Data: single RPC `tours_admin_analytics(p_from, p_to)` (migration `supabase/migrations/20261102_f9_dashboards.sql`), parsed defensively by `parseAnalytics` (`lib/tours/dashboards.ts`).
- Range control (query params): preset pills `?range=` 7d "7 days", 30d "30 days" (default), 90d "90 days", 365d "12 months"; plus custom From/To date inputs (GET form, `max=today`, "Apply"). Custom valid only if `from<=to<=today` and span <= 366 days, otherwise falls back to preset/default. Dates in Asia/Manila. Active pill has `aria-current`. Range caption "Mon, Nov 1 – Tue, Nov 14".
- KPI tiles (4):
  - Tourist check-ins = sum of daily arrivals ("arrivals scanned by guides")
  - Bookings = `bookings.total`, note "{pax} travellers confirmed"
  - Revenue received = sum of operator revenue ("all operators"), via `formatPeso`
  - Cancellation rate = cancelled / (total - rejected), 1 decimal; "—" when base is 0; note "{cancelled} cancelled · {rejected} declined"
- Charts/panels:
  - Column chart "Arrivals per day (check-ins)" (`components/charts/column-chart.tsx`), zero-filled per day (max 400 days), aria-labels per bar.
  - Bar list "Revenue by operator" (operators with revenue>0 or bookings>0; note "· N booking(s)"). Empty: "No bookings or payments in this range."
  - Bar list "Top packages" (links to `/tours/packages/{id}`; "bookings · N pax"). Empty: "No bookings in this range."
  - Bar list "Top attractions in trip plans" (links to `/tours/attractions/{slug}`; "plans"). Empty: "No saved trip plans in this range."
  - Bar list "Rating distribution" 5★..1★, header link "Moderate" -> `/tours/admin/reviews`. Empty: "No reviews in this range."
  - "Accreditation queue" card (link "Review applications" -> operators): text "No applications are waiting." or "N waiting now. Oldest: {name} ({kind}), {d} day(s)."; 3 bucket tiles "Under 3 days", "3–7 days", "Over 7 days"; the last bucket shows warning badge "Overdue" when count > 0.
- Error: Notice "Analytics could not be loaded / Please try again in a moment." (page still renders with zeros/empty states).
- Unused in UI though returned: bookings pending/confirmed/completed breakdown, operator `refunded`. No export, no sort/filter beyond date range.
