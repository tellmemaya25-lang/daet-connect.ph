# CONNECT-DAET.ph — tours subsystem starter

This repository contains the CONNECT-DAET tours subsystem, including operator and local-guide accreditation flows with admin approval queues. It uses the App Router, Server Actions, Supabase Auth/Storage/Postgres, and mobile-first Tailwind UI.

## Local setup

1. Install Node.js 20.9+ and run `npm install`.
2. Copy `.env.example` to `.env.local`; fill in the Supabase URL, anon/publishable key, and service-role key. Never commit `.env.local` or expose the service-role key to browser code.
3. Create a **private** Supabase Storage bucket named `tours-operator-documents` (or set `TOURS_OPERATOR_DOCUMENTS_BUCKET`). Set its maximum file size to at least 5 MB and allow `image/jpeg`, `image/png`, `image/webp`, and `application/pdf`. The service-role key uploads files from the server; private signed URLs are generated for admins and expire after 10 minutes.
4. Run `npm run dev`.
5. Run `npm test` for unit/component/action tests. `npm run test:e2e` runs the Playwright mobile registration flow in Supabase preview mode; install the browser once with `npx playwright install chromium` if needed.

The app expects the existing `get_my_role()` RPC to return the signed-in user's `profiles.role` value. Registration is limited to `tourist`/`operator` accounts; the role is re-checked on the server. Admin approval sets `profiles.role = 'operator'` and the dashboard also requires an `approved` `tours_operators.accreditation_status` row. The platform-wide sign-in/profile-provisioning flow is not part of this feature; the pages link to `/login`, so wire that path to the shared Supabase Auth experience before launch.

The existing schema should enforce at most one operator application per `user_id` (including rejected applications, which are updated on resubmission). The action checks current status and uses a conditional update, but database uniqueness is still required to prevent simultaneous first submissions from creating duplicates.

## Existing schema integration

No database tables, enums, or migrations are created by this feature. Because the repository started without generated Supabase types or the schema DDL, the field mapping is centralized in `src/lib/tours/operator-contract.ts` and currently expects:

- `tours_operators`: `id`, `user_id`, `business_name`, `contact_person`, `contact_email`, `contact_phone`, `business_address`, `dti_registration_url`, `business_permit_url`, `gcash_qr_url`, `accreditation_status`, `rejection_reason`, `reviewed_by`, `reviewed_at`, and `created_at`.
- `profiles`: `id` (same UUID as `auth.users.id`) and `role`.

The three `*_url` columns contain **private Storage object paths**, not public URLs. If the verified schema uses different names, change the centralized contract and the select/update payloads to match it; do not add or recreate tables. The feature fails closed if an authenticated role cannot be read.

## Security notes

- Application documents are private. The browser sends them to a Server Action; the server checks the authenticated user, role, total/per-file size, MIME signature, and ownership path before upload.
- The action uses the service-role client only on the server and only after checking the user's Supabase session. Admin listing/review repeats a server-side `get_my_role() === 'admin'` check.
- Operator pages must continue checking both role and accreditation status in future Server Actions, not just hide dashboard links in the UI.
- Admin document links are short-lived signed URLs. Do not make this bucket public.
- Images are recompressed in the browser before upload (QR images retain lossless PNG output where possible); PDFs are uploaded unchanged.

## Guide accreditation

Guide registration adds `/tours/guide/register`, `/tours/guide/pending`, `/tours/guide/dashboard`, `/tours/guide/my-qr`, and the admin queue at `/tours/admin/guides`. The application stays pending until an admin approves it; the dashboard and downloadable/printable badge QR each re-check both `profiles.role = 'guide'` and the approved status on the server.

The guide ID document goes to a separate **private** Storage bucket named `tours-guide-sensitive-documents` (or `TOURS_GUIDE_SENSITIVE_BUCKET`). Configure it with a 5 MB max object size and `image/jpeg`, `image/png`, `image/webp`, `application/pdf`. Storage reads are not exposed to browser clients: an admin-only Server Action selects only the stored object path using service_role and returns a 3-minute signed download link. The QR payload contains only the public guide row UUID; it never includes ID numbers, document paths, or consent data. Sensitive-table reads and writes and private-link creation emit a minimal structured `guide-sensitive-audit` event to server logs containing actor ID, guide ID, operation, outcome, and timestamp—but no ID number, document path, URL, or file content. No audit table is assumed or added; configure the hosting platform’s server-log retention/access policy before production use.

No guide schema is created or migrated. The existing database should enforce at most one `tours_guides` row per `profile_id` to avoid concurrent duplicate first applications. Since the repository has no generated database types or DDL, `src/lib/tours/guide-contract.ts` centralizes the expected field names:

- `tours_guides`: `id`, `profile_id`, `contact_phone`, `bio`, `consent_full_id_display`, `consent_given_at`, `accreditation_status`, `accreditation_notes`, `reviewed_by`, `reviewed_at`, and `created_at`.
- `profiles`: `id`, `full_name`, and `role`; guide registration syncs the applicant’s public name here.
- `tours_guide_sensitive_info` (service_role only, with a unique `guide_id` for upsert): `guide_id`, `full_legal_name`, `id_type`, `id_number`, and `id_document_path`.

Verify those names against the existing locked schema before production use, and ensure the existing `profiles.role` type/policies already accept the `guide` role value. The Server Action rejects unchecked consent before upload or database writes, generates `consent_given_at` on the server, writes consent and the timestamp to the public guide row, and writes the full legal name and ID details only to the sensitive row via the server-side service-role client. No Client Component or Server Component queries the sensitive table. Existing RLS policies must allow an authenticated applicant to read their own status and insert/update their own guide row, allow the admin queue’s authenticated query to select pending public rows and their corresponding profile names, and prevent public readers from seeing unapproved profiles; the private sensitive table and private Storage bucket must remain inaccessible to browser clients. No policy or schema changes are bundled here.

## Events calendar & merchandise showcase

- Public pages: `/tours/events` (monthly calendar, category filter, day view, "Add to my calendar" `.ics` download) and `/tours/merch` (t-shirts, mugs, souvenirs, pasalubong with seller contact). The home page shows upcoming events and featured products.
- Admin pages: `/tours/admin/events` and `/tours/admin/merch` (create, edit, publish/hide, feature, delete). Linked from the admin dashboard's Quick Actions.
- Setup: apply `supabase/migrations/20261023_create_tours_events_and_merchandise.sql`. It creates `tours_events` and `tours_merchandise` with RLS (the public reads published/active rows; only `get_my_role() = 'admin'` can write) and the public `tours-promo-images` Storage bucket (admin upload, public read, 5 MB, JPG/PNG/WebP).
- All event times are entered and shown in Philippine time (UTC+8); date logic lives in `src/lib/tours/events-calendar.ts`.
- Merchandise listings are advertisements only. Checkout belongs to the Shop subsystem (Team 7).
