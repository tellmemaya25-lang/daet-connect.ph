# Admin screens A: Operators, Packages, Reviews, Guides

Base: `src/app/(subsystems)/tours/admin/`. Facts from code only; no runtime check.

## 1. Operators — `/tours/admin/operators`
Files: `operators/page.tsx`, `operators/review-card.tsx`; action `reviewOperatorApplication` in `../operator/actions.ts` (l.282); contract `src/lib/tours/operator-contract.ts`.

- Layout: card list, not a table. Header "Operator applications" + badge "Pending · page N". Info notice: documents are private, links expire in 10 min.
- Data: `tours_operators` where `accreditation_status = 'pending'`, oldest first (`created_at` asc), 20/page via admin (service-role) client.
- Card fields shown: status chip "Pending review", business_name, submitted date (en-PH), short ID (first 8), contact_person, contact_phone, contact_email, business_address, 3 private docs (DTI / registration, Business permit, GCash QR).
- Filters/search/sort: none. Fixed to pending only; no way to view approved/rejected. Pagination: Previous/Next via `?page=` (next shown when a full page of 20 returned; page clamped 1..100000).
- Row actions: Message applicant (`OpenChatButton`, kind `operator_admin`); Download doc links (signed URL, 10 min, `download: true`, new tab; "X unavailable" chip if missing); Reject; Approve.
- Bulk actions: none. Signed URLs are created in one bulk call per page.
- Reject form: field `rejectionReason`, textarea, 2 rows, maxLength 1000, required in practice (server: trimmed length >= 10, <= 1000). Help text "Keep the note factual...". Hidden `operatorId` (UUID checked), `decision` (`approved`|`rejected`). Approve form has no extra fields (no confirm dialog).
- Statuses: `AccreditationStatus` = `pending | approved | rejected`. Only "Pending review" label rendered in this screen. Approve sets profile role tourist -> operator (rolls back on failure), clears note; reject stores note in `accreditation_notes`; both set `reviewed_by`, `reviewed_at`. Success text: "Operator approved." / "Application rejected; the applicant can resubmit."
- Buttons lock (disabled) while pending or after success; label "Saving…". Card stays on page after success (no removal until revalidate).
- Empty: "You're all caught up" / "There are no pending operator applications on this page."
- Errors: Supabase not configured (warning notice); not signed in (info, sign-in link with `next`); non-admin (error notice); service-role key missing (error notice); query failure ("The review queue could not be loaded"); action errors: not signed in, not admin, invalid id, choose approve or reject, reason < 10 ("Add a clear reason so the operator knows what to fix."), > 1000, "no longer pending ... Refresh the queue", role could not be safely updated, role changed while open, "changed before this decision was saved". Signing failure is swallowed (docs show "unavailable").

## 2. Packages list — `/tours/admin/packages`
File: `packages/page.tsx`. No server action on this page.

- Layout: three stacked sections of cards: "Pending Approval (n)", "Published (n)", "Archived (n)" (archived section hidden if 0). Back link to `/tours/admin`.
- Data: all `tours_packages` (id, title, status, created_at, operator_id) newest first, no limit/pagination; operator, profile name, and price (default variant `price_per_pax || flat_price`) fetched in separate queries. Uses user session client (RLS), not admin client. Auth: non-user or non-admin silently `redirect('/')`.
- Card fields: title, status chip, Operator (business_name or "Unknown"), Contact (profile full_name or "Unknown"), Base Price (`formatPeso`, "N/A" if null; 0 shows as peso zero), Submitted date (`toLocaleDateString()`).
- Filters/search/sort: none (grouping by status only, fixed sort).
- Row action: "Review" link to `/tours/admin/packages/[id]`. No bulk actions.
- Statuses: `pending_review` or `pending` -> Pending Approval group; `published`; `archived`; `draft` computed but never rendered (drafts are not shown anywhere); `rejected` also not rendered. Chip shows the raw status string; color map has only pending/published/archived keys, so `pending_review` gets class `undefined` (no color).
- Empty: "No pending packages", "No published packages" (plain boxes).
- Errors: fetch error is only `console.error`; page then renders as empty. Stray `console.log` of count.

## 3. Package detail — `/tours/admin/packages/[id]`
Files: `packages/[id]/page.tsx`, `package-review-form.tsx`, `actions.ts` (`updatePackageStatus`).

- Read-only sections: header (title), Package Information (status chip, description), Operator Information (business_name, contact_person, contact_phone, email; "N/A" fallbacks), Pricing (variants: min_pax - max_pax, `price_per_pax` per person; section hidden if none), Inclusions (check/cross + item_text), Itinerary (stop_order, location_name, description, duration min), Gallery (count only, text "Image URLs stored in database"; no images rendered). Empty sections are simply omitted.
- Form "Review & Update Status":
  - `status` select, required (always has a value): Draft, Pending Review, Published, Archived. Hint text per option. Initial value = current status, with unknown/`pending`/`rejected` mapped to `pending_review`.
  - `notes` textarea, 4 rows, optional, no maxLength. Server only stores it when status is `rejected` (as `rejection_reason`), which the form cannot select; so notes are effectively written only to audit log `tours_admin_audit_log.notes` (best effort).
  - Buttons: "Update Status" (disabled when unchanged or submitting; label "Updating..."); "Quick Approve" (shown unless status is `published`; sets published then dispatches a synthetic submit after 100 ms via `document.querySelector('form')`).
- Server validation: packageId and status required ("Missing required fields"); must be authenticated ("Not authenticated"), admin ("Unauthorized"). No allow-list check on `status` server side. Publishing clears `rejection_reason`. Audit log `old_value` always null. Revalidates list and detail.
- Feedback: inline green "Package status updated successfully!" or red message with server error; notes cleared on success. Page does not refresh status chip except via revalidate.
- Status labels/colors on detail: `pending_review` yellow, `published` green, `rejected` red, other gray; raw string shown (e.g. "pending_review").
- Error state: fetch failure or missing -> red box "Package not found / It may have been deleted..." with link "← All packages". Auth failure silently redirects to `/`.
- Mismatch to note: form cannot set `rejected`; action supports it; list page does not display it.

## 4. Reviews — `/tours/admin/reviews`
Files: `reviews/page.tsx`, `reviews/moderate-form.tsx`; action `setReviewHidden` in `../reviews/actions.ts` (l.48); auth `requirePromoAdmin` (`src/lib/tours/promo-admin.ts`).

- Layout: card list (`Card` per review) under title "Reviews" with back link to admin dashboard. Explainer: hidden reviews vanish from public pages and ratings; traveller and operator still see them with the reason.
- Data: `tours_reviews` (+ package title, operator business_name) newest first, hard limit 200, no pagination.
- Filters (tab links, `?show=`): All (default), "1–2 stars" (`show=low`, `rating <= 2`), Hidden (`show=hidden`, `is_hidden = true`). No search, no sort control.
- Card fields: package title (links to `/tours/packages/[package_id]#reviews`), operator name, date (Asia/Manila), `Stars`, "Hidden" danger badge, comment (or "Rating only."), operator reply block, "Reason: ..." when hidden. Hidden cards get red tint.
- Row action: hide/restore form. Hide: text input `reason` (sr-only label "Reason for hiding", maxLength 300, placeholder example, optional in UI) + danger button "Hide review"; restore: secondary button "Show again" (no reason field). Loading text "Saving…". Bulk: none.
- Validation (server): reviewId must be UUID ("Review not found."); hiding requires reason >= 3 chars ("Give a short reason for hiding this review."); calls RPC `tours_set_review_hidden`; DB errors mapped by `userFacingDbError` (fallback "The review could not be updated."). Error shown inline under the form; success -> `router.refresh()`.
- Statuses: boolean `is_hidden` (Visible/Hidden); no moderation states otherwise.
- Empty: `EmptyState` "No reviews here" (same for every filter). Load error: error notice "Reviews could not be loaded." (rendered above empty state).
- Access denied: `PromoAdminDenied` with message (sign-in or "Only Tourism Office admins can manage this content.").

## 5. Guides — `/tours/admin/guides`
Files: `guides/page.tsx`, `guides/guide-review-card.tsx`; actions `reviewGuideApplication` (l.482) and `getGuideSensitiveDocumentLink` (l.~400) in `../guide/actions.ts`; contract `src/lib/tours/guide-contract.ts`.

- Layout and behavior mirror Operators: card list, header "Guide applications", badge "Pending · page N", warning notice (ID files sensitive, links expire in 3 min).
- Data: guides table where `accreditation_status = 'pending'`, oldest first, 20/page (user session client, RLS); names joined from `profiles.full_name` ("Name unavailable" fallback). Sensitive table is never queried by the page.
- Card fields: chip "Pending guide review", full_name, submitted date (Asia/Manila), short ID, contact_phone, bio (guide introduction).
- Filters/search/sort/bulk: none. Pagination via `?page=` Previous/Next.
- Row actions: "Request ID document link" (server action; shows "Creating secure link…", then message and "Download private ID document ↗" link; TTL 180 s; only for pending guides, else "This guide is not awaiting review or could not be found."); Reject; Approve.
- Reject form: `rejectionReason` textarea, 2 rows, maxLength 1000, server requires >= 10 ("Explain what the applicant needs to correct."), <= 1000. Hidden `guideId` (UUID), `decision`.
- Statuses: `GuideAccreditationStatus` = `pending | approved | rejected`; only pending shown. Approve sets profile role tourist -> guide (with rollback), reviewer fields set, notes null; reject stores note. Success: "Guide approved. Their dashboard and badge QR are now available." / "Guide application rejected; the guide may resubmit."
- Empty: "No pending guide applications" / "You're all caught up on this page."
- Errors: Supabase not configured; not signed in (sign-in link); non-admin; list query failure ("Guide applications could not be loaded"); profile name query failure ("Guide applicant names could not be loaded"); action errors like operators ("no longer pending", role could not be safely updated, "changed before this decision was saved"). Note: error screens here use `PageFrame` without `adminNav`.

## Cross-screen observations
- Operators and Guides share the same pattern (pending-only queue, approve/reject with reason, no history, no search). Packages and Reviews are separate patterns.
- Auth differs: Operators/Guides use `getAuthenticatedSession` with inline notices; Packages redirect to `/` silently; Reviews use `requirePromoAdmin` + `PromoAdminDenied`. Packages and Guides use the RLS session client; Operators use service-role.
- No screen has search, sortable columns, or bulk actions; none use tables.
