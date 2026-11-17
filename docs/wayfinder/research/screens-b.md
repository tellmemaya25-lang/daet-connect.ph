# Admin screens B: Attractions, Guide places, Events

Root: `src/app/(subsystems)/tours/admin/` (abbrev `A/`). Shared: `src/lib/tours/promo-admin.ts`, `src/lib/tours/promo-validation.ts`, `src/components/tours/{promo-admin-denied,promo-fields,use-promo-form,confirm-submit-button,csv-import-form}.tsx`.

## Cross-cutting behaviour (all 3 areas)
- Every page is `force-dynamic`, wrapped in `PageFrame adminNav`, gated by `requirePromoAdmin()` (`lib/tours/promo-admin.ts`). Not admin: `PromoAdminDenied` page, error Notice "Admin access required" with message ("Please sign in with a Tourism Office admin account." / "Only Tourism Office admins can manage this content.") and a "Sign in" link to `/login?next=...`.
- Header: `AdminPageHeading` = back link ("← Admin dashboard" on lists, "← All <things>" on forms), H1, primary pill button (+ New ...) on lists.
- Flash notices on lists via query string: `?saved=1` "X saved.", `?deleted=1` "X deleted." (success); `?error=...` "That action could not be completed." (error); load failure Notice "<Things> could not be loaded." (events adds "Has the events migration been applied?").
- Lists: no search, no sort control, no pagination, no bulk select/actions. Only a hard `.limit()` (attractions 500, guide places 500, events 200). Row actions are Edit (link) and Delete (POST form with `ConfirmSubmitButton`, native confirm message `Delete "<name>"? This cannot be undone.`). No archive/duplicate/publish-toggle on the row; toggles live only in the edit form.
- Forms: client components using `usePromoForm` (transition submit, keeps field values on error, scrolls to top when `state.message`). `noValidate`, so validation is server-side only; HTML `required`/`maxLength` attributes are cosmetic. Error shape: top `Notice` error with `state.message` ("Please fix the highlighted fields.") plus per-field error under `PromoField` and `aria-invalid`. Save success: server redirect to list with `?saved=1`. Buttons: Cancel (link to list) and submit (label "Saving…" while pending; "Add attraction" / "Add place" / "Create event" on new, "Save changes" on edit).
- New/edit pages: edit validates id (attractions + guide places: `isUuid` else `notFound()`; events: no uuid check, just `notFound()` when row missing). Save on a deleted row returns "This attraction no longer exists." / "This event no longer exists." (guide places has no such check).
- Image upload (attractions, events only): `PromoImageField`, JPG/PNG/WebP, max 5 MB ("Image must be a JPG, PNG, or WebP file." / "Image must be 5 MB or smaller."); "removeImage" checkbox; old image deleted from storage on replace/delete; new upload removed if DB save fails.

## 1. Attractions
Files: `A/attractions/page.tsx`, `new/page.tsx`, `[id]/edit/page.tsx`, `attraction-form.tsx`, `import-form.tsx`, `actions.ts`; model `src/lib/tours/attractions.ts`. Table `tours_attractions`.

### List (`/tours/admin/attractions`, title "Attractions")
- Layout: card-style `<ul>` rows, not a table. Ordered by name asc.
- Row content: name; badges: category label (brand), municipality (plain text), "Hidden" (neutral, if `!is_active`), pin badge, "No hours" (neutral, if no `opening_hours`).
- Stats tiles (computed from loaded rows): "Listed" (count), "Without a map pin", "Pins not yet confirmed".
- Intro text links to `/tours/admin/guide-places` ("local guide").
- Filters/search/sort: none.
- Row actions: Edit, Delete (confirm). No bulk actions except CSV import card below.
- Bulk: "Import from a spreadsheet" card (`import-form.tsx`): file input `.csv`, "Import CSV" button (loading "Importing…"), "Download a template" link (data URI `attractions-template.csv`). Server rules (`actions.ts` `importAttractionsCsv`): file required ("Choose a CSV file."), <= 1 MB ("The file is larger than 1 MB."), must be .csv/csv/plain ("Upload a .csv file."); <= 300 rows, header must include name, category, source; all-or-nothing validation (message "Nothing was imported. Fix N row(s) and try again." plus scrollable list "Line N: field: msg"); existing slugs skipped, duplicate slugs within file are an error; success "Imported N attraction(s). Skipped M already listed."; DB failure "The import failed. Nothing was saved. Please try again." CSV columns: name, category, municipality, address, latitude, longitude, hours, hours_note, dwell_minutes, entrance_fee, description, source, slug.
- Empty: "No attractions yet. Add one or import the Tourism Office list."
- Error: Notice "Attractions could not be loaded." (list still renders empty text).

### Status labels
- Category (`ATTRACTION_CATEGORIES`): beach=Beach, heritage=Heritage, nature=Nature, park=Park & plaza, food=Food, adventure=Adventure, shopping=Shopping, religious=Church.
- Visibility: `is_active` true = shown; false = badge "Hidden" (form label "Show in the public directory"; "Hidden attractions stay visible to admins only.").
- Pin: "No pin" (warning; latitude null), "Pin confirmed" (success; `location_verified`), "Pin unconfirmed" (info).

### Form (new and edit; titles "New attraction" / "Edit attraction"; card max-w-2xl)
| Field (name) | Control | Required | Validation / default |
|---|---|---|---|
| Name (`name`) | text, maxLength 120 | yes | 2-120 chars: "Name must be 2 to 120 characters." |
| Category (`category`) | select, 8 options | yes | default beach; "Choose a category." |
| Web address (`slug`) | text, max 80, placeholder bagasbas-beach | no | hint "Leave empty to make one from the name."; auto-slugified; must match `^[a-z0-9]+(-[a-z0-9]+)*$`: "Use lowercase letters, numbers and dashes (e.g. bagasbas-beach)."; unique, dup (23505) gives "Another attraction already uses that web address." + slug error "Choose a different slug." |
| Municipality (`municipality`) | text, max 60 | no | default "Daet" |
| Address or landmark (`address`) | text, max 200 | no | "Keep this under 200 characters." |
| Latitude / Longitude (`latitude`,`longitude`) | text, inputMode decimal, in "Map pin" fieldset | no, but both or neither | finite, |lat|<=90, |lng|<=180; both must be present if either; must fall within lat 12-16 / lng 121-125 else "This pin is far from Camarines Norte. Check that latitude and longitude are not swapped." |
| Pin confirmed (`locationVerified`) | checkbox | no | default false; forced false when no pin |
| Opening hours (`hours`) | text | no | parsed by `parseHoursText` (`lib/tours/opening-hours`), e.g. "Mon-Fri 08:00-17:00; Sat 09:00-12:00; Sun closed", "Daily 06:00-18:00", "24/7"; stored as structured `opening_hours`; prefilled via `hoursToText` |
| Hours note (`hoursNote`) | text, max 200 | no | e.g. "Closed on holidays" |
| Typical visit minutes (`dwellMinutes`) | text numeric | no | integer 5-720: "Typical visit length must be 5 to 720 minutes."; used by itinerary planner |
| Entrance fee ₱ (`entranceFee`) | text decimal | no | strips ₱ and commas; `^\d+(\.\d{1,2})?$`, <= 100000: "Enter the fee in pesos, e.g. 50 or 0 for free."; 0 = free, empty = unknown |
| Description (`description`) | textarea 5 rows, max 2000 | no | |
| Source (`source`) | text, max 500 | yes | 3-500 chars: "Say where this information comes from (e.g. Daet Tourism Office, 2026)." |
| Image (`image`, `removeImage`) | file + remove checkbox | no | see cross-cutting |
| Show in public directory (`isActive`) | checkbox | no | default true |
Edit includes hidden `id`. Save revalidates public attraction pages and old slug if changed.

## 2. Guide places
Files: `A/guide-places/page.tsx`, `new/page.tsx`, `[id]/edit/page.tsx`, `guide-place-form.tsx`, `actions.ts`; models `src/lib/tours/guide/places.ts`, `src/lib/tours/guide/csv.ts`; import UI `src/components/tours/csv-import-form.tsx`. Table `tours_guide_places`.

### List (`/tours/admin/guide-places`, title "Local guide places")
- Layout: `<ul>` of cards; ordered by kind then name.
- Row: name; subline "<municipality> · <price label>" (`priceLabel`: "₱a–₱b per meal", "from ₱a ...", single price; omitted when no price); badges: kind label (brand), "Verified" (success) or "Verify locally" (warning), "No pin" (neutral, latitude null), "Hidden" (neutral, !is_active).
- Stats tiles: "Listed", "Not yet verified", "Food or stay without a price" (eatery/lodging with both prices null). Counts reflect the current filter.
- Filter: kind chips nav (`?kind=<value>`; "All" + 6 kinds; `aria-current=page`; unknown kind value ignored = All). No text search, no sort control.
- Intro copy: the Daet AI assistant recommends only what is listed here; links to `/tours/admin/fares`.
- Row actions: Edit, Delete (confirm). No bulk select. Bulk: CSV import card at the page bottom ("Import from a spreadsheet", `CsvImportForm`, required columns "kind, name, source", template `guide-places-template.csv`). Server (`importGuidePlacesCsv`): no file "Choose a CSV file."; > 1 MB "The file is larger than 1 MB." (no extension check); <= 300 rows; all-or-nothing; per-line errors; duplicate slug in file flagged "slug "x" repeats an earlier row."; existing slugs skipped; success "Imported N place(s). Skipped M already listed."; imported rows are `isActive: true`. CSV columns: kind, name, municipality, address, latitude, longitude, price_min, price_max, price_unit, specialties, tags, hours, phone, description, source, checked_on, slug.
- Empty: "No places yet. Add one or import a spreadsheet." (also shown for an empty filter result). Error: "Places could not be loaded."

### Status labels
- Kind (`GUIDE_PLACE_KINDS`): eatery=Food, lodging=Place to stay, terminal=Terminal, pasalubong=Pasalubong, meeting_point=Meeting point, service=Help and services.
- Price unit (`PRICE_UNITS`): meal="per meal", night="per night", trip="per trip", item="per item".
- Verification: `verified` = "Verified" / "Verify locally"; `location_verified` (pin confirmed) is only in the form, not shown as a badge. Visibility: `is_active` / "Hidden".

### Form (titles "New place" / "Edit place")
| Field | Control | Required | Validation / default |
|---|---|---|---|
| Kind (`kind`) | select (6) | yes | default eatery; "Choose what kind of place this is." |
| Name | text max 120 | yes | 2-120 |
| Municipality | text max 60 | no | default Daet |
| Address or landmark | text max 200 | no | |
| Latitude / Longitude | text decimal (Map pin fieldset) | no, both or neither | finite; must be within lat 12-16, lng 121-125 (no +/-90/180 check); hint: without a pin, directions search Google Maps by name and municipality |
| Pin confirmed (`locationVerified`) | checkbox | no | default false |
| Price from / up to (`priceMin`,`priceMax`) | text decimal | no | `^\d+(\.\d{1,2})?$`, <= 1,000,000: "Enter an amount in pesos, e.g. 250."; min <= max: "The highest price must not be below the lowest." |
| Price is (`priceUnit`) | select: Not set / per meal / night / trip / item | required if any price set | "Say what the price is for." |
| Known for (`specialties`) | text, comma/semicolon list | no | max 12 items |
| Tags (`tags`) | text, comma list (e.g. family, vegetarian, wifi, parking) | no | max 12 items |
| Opening hours | text | no | same parser as attractions |
| Phone (`phone`) | tel, max 40 | no | |
| Description | textarea 3 rows, max 1000 | no | |
| Source | text max 500 | yes | 3-500 |
| Checked on (`checkedOn`) | date input | no | defaults to today (Manila) when empty; `YYYY-MM-DD` |
| Verified by Tourism Office (`verified`) | checkbox | no | default false; hint "Unverified places are shown with a 'verify locally' note." |
| Show to travellers (`isActive`) | checkbox | no | default true |
| `slug` | hidden input (value of existing slug, else empty so auto-generated from name) | n/a | not editable in UI; slug validated same as attractions; dup gives "Another place already uses that web address." |
No image upload for guide places. Save revalidates only the admin list path.

## 3. Events
Files: `A/events/page.tsx`, `new/page.tsx`, `[id]/edit/page.tsx`, `event-form.tsx`, `actions.ts`; validation `parseEventForm` in `src/lib/tours/promo-validation.ts`; dates `src/lib/tours/events-calendar.ts`. Table `tours_events`.

### List (`/tours/admin/events`, title "Events calendar")
- Layout: `<ul>` of cards, ordered by `starts_at` desc (newest/future first), limit 200.
- Row: category pill, status pill ("Published" green / "Draft" yellow), "Past" pill (muted; `ends_at` < now); title (truncated); "<formatted date range> · <venue>".
- Filters/search/sort controls: none. No stats tiles. No import/bulk.
- Row actions: Edit, Delete (confirm). Delete does not validate uuid shape (only non-empty id).
- Empty (only when no error): dashed card with calendar icon, "No events yet" / "Add festivals, cultural shows and markets for tourists to discover." Error: "Events could not be loaded. Has the events migration been applied?"
- Save/delete revalidates `/`, `/tours/events`, `/tours/admin/events`, `/tours/events/<id>`.

### Status labels
- Category (`EVENT_CATEGORIES`): festival=Festival, cultural=Cultural, sports=Sports, religious=Religious, market=Market / Bazaar, other=Other.
- Status: `is_published` true = "Published", false = "Draft"; derived "Past". Form checkbox label "Publish on the public calendar" ("Unpublished events are only visible to admins.").

### Form (titles "New event" / "Edit event"; both pages load active attractions `id, name` ordered by name for the picker)
| Field | Control | Required | Validation / default |
|---|---|---|---|
| Event title (`title`) | text max 120 | yes | 3-120; "Title is required." / "Title must be at least 3 characters." / "... 120 characters or fewer." |
| Category | select (6) | yes | default festival; "Choose an event category." |
| Organizer | text max 120, placeholder "e.g. Daet Tourism Office" | no | |
| Venue | text max 160 | yes | 2-160 |
| Attraction (`attractionId`) | select: None + active attractions | no | UUID check: "Choose an attraction from the list."; hint "Links the event to an attraction page and suggests tours nearby." |
| Starts / Ends (`startsAt`,`endsAt`) | `datetime-local`, hint "Philippine time" (Manila-local converted to ISO) | yes | "Enter a valid start date and time." / "Enter a valid end date and time."; end >= start: "End must be on or after the start."; span <= 62 days: "Events can span at most 62 days." |
| Description | textarea 5 rows, max 2000 | no | |
| Source of the date (`source`) | text max 300 | no | admin only; hint "E.g. Tourism Office memo, TPB calendar link." |
| Image | file + remove | no | see cross-cutting |
| Publish (`isPublished`) | checkbox | no | default true on new |
Generic save failure: "The event could not be saved. Please try again." Insert sets `created_by` to admin user id.

## Notable inconsistencies (factual)
- Only guide places have a filter (kind chips) and verified/"verify locally" state; attractions and events have none.
- Edit-page id guards differ: events skip `isUuid`; guide places lack "no longer exists" message on save.
- Only attractions have an extension check on CSV upload; both import forms are all-or-nothing and skip existing slugs.
- Events list shows no counts; attractions/guide places show 3 stat tiles each.
