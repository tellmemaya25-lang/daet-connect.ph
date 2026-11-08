# DAET Connect — Booking Management System Implementation Plan

> Reverse-engineered from 8 UI screenshots (Nov 2025). This document is the blueprint for the PR: `feature/booking-management-v1`.

---

## 1. Executive Summary

Build a **Booking Operator Dashboard** for the DAET Connect tourism platform (Cam Norte / Daet). Operators manage tour bookings through a filterable list, expandable booking cards, and an approval workflow that assigns a certified local eco-guide after verifying daily capacity.

**Goal:** Pixel-accurate, fully functional replica of the screenshots as a modern SPA, with mock data, no backend dependency, ready to wire to a real API later.

**Constraints:** Empty workspace → greenfield. Need to ship a reviewable PR with demo + tests.

---

## 2. What We Found in the Screenshots

### 2.1 Global Layout
- **Header nav:** `DAET` brand + 3 pills: `Bookings` (active, blue #2563eb), `Packages`, `Revenue` (grey inactive)
- **Page title:** `Bookings` + subtitle *Easy booking for CamNorte Tour Services...* (blurred, we’ll use placeholder)
- **Background:** light `slate-50` page, white cards with soft shadow + 1px border `slate-200`, rounded `16px`.

### 2.2 Filters Bar (Top Card)
- **Search input:** placeholder `Reference, package, name or phone...` with magnifying glass icon, rounded-full.
- **Package dropdown:** `All Tour Packages` (full list of tour names)
- **Date picker:** `mm/dd/yyyy` with calendar icon (native `<input type="date">`)
- **Status pills row:** `All 27` (active blue), `To Confirm 10`, `Confirmed 8`, `Completed 5`, `Declined 2`, `Refunded 2` — counts update live. Active pill = blue bg white text, inactive = `slate-100` with `slate-700` text + count badge `slate-200`.

### 2.3 Table Header
- Row: checkbox + `Tour Package & Ref` | `Guest` | `Date & Pax` | `Total` | `Status` (all-caps `slate-500` 11px)

### 2.4 Booking Card (Collapsed)
For each booking:
- **Left:** checkbox + square `DAET` badge `sky-50`/`sky-700` border
- **Package:** bold `slate-900` name + ref `BK-20261107-XXXXXX` in blue `600`
- **Guest Contact:** `GUEST CONTACT` label (10px slate-400) + Name bold + phone `slate-500`
- **Tour Date & Pax:** `TOUR DATE & PAX` label + calendar icon + date `YYYY-MM-DD` + `N Guests`
- **Total Amount:** `TOTAL AMOUNT` label + `₱X,XXX.00` bold + subline: `₱500.00 of ₱500.00 paid` (green) | `Pending Verification` (green) | `Refunded via GCash (Ref: ...)` (green)
- **Status pill:** 
  - `To Confirm` = amber `bg-amber-100` `text-amber-700` border amber-200 + clock icon
  - `Confirmed` = emerald `bg-emerald-50` `text-emerald-700` + check-circle
  - `Refunded` = purple `bg-purple-100` `text-purple-700` + refund icon
  - `Completed`/`Declined` inferred (we’ll add)
- **Actions:** `Approve` blue button `bg-blue-600` + chevron dropdown (for To Confirm) OR expand/collapse chevron circle (for Confirmed/Refunded)

### 2.5 Booking Card (Expanded)
3-column grid (stacks on mobile):
1. **Guest Notes & Requests** `bg-slate-50` card: italic quote + `Email:` + `Phone:`
2. **Guide & Operations** `bg-slate-50` card: `Assigned Guide:` (name or `Unassigned` bold) + `Payment Status:` (colored)
3. **Quick Actions** `bg-slate-50` card:
   - To Confirm → `Approve Booking` (blue), `Decline` (red-50), `Process Refund` (purple-50), `Call Tourist` (white with phone icon)
   - Confirmed → `Process Refund` + `Call Tourist`
   - Refunded → no actions (or Process Refund disabled)

### 2.6 Approve & Assign Eco-Guide Modal
- Centered white modal `rounded-[20px]` shadow-2xl, 512px max-width.
- Header: `BK-...` small blue + `Approve & Assign Eco-Guide` title + X close button.
- Info card: `Package:` + name bold + `Guest:` + name + `Pax: N` right-aligned.
- **Capacity banner:** green `bg-emerald-50` `border-emerald-200` with check-circle + text `Daily capacity check verified: Sufficient slots available for YYYY-MM-DD.`
- **Dropdown:** `ASSIGN CERTIFIED LOCAL ECO-GUIDE` label uppercase + `Select accredited guide...` select; expanded options:
  - `Bianca Zabala (Surfing & Coastal Specialist)`
  - `Jayson Barlan (Heritage & Cultural Guide)`
  - `Ramil Alcantara (Calaguas Expedition Leader)`
- Footer: `Cancel` grey + `Confirm & Send Voucher` blue pill button.

### 2.7 Toast
- Top-right `DAET-CONNECT COMMAND` label blue + `Booking BK-... confirmed with guide X!` + checkmark in blue circled icon, white card with shadow.

---

## 3. Data Model

```ts
type BookingStatus = 'To Confirm' | 'Confirmed' | 'Completed' | 'Declined' | 'Refunded';

type Booking = {
  id: string; // BK-20261107-XXXXXX
  packageName: string;
  packageSlug: string;
  guestName: string;
  guestPhone: string;
  guestEmail: string;
  guestNotes: string; // e.g. "no alcohol", "Vegetarian meal..."
  tourDate: string; // ISO YYYY-MM-DD
  pax: number;
  totalAmount: number; // PHP
  paidAmount: number;
  paymentStatus: 'Paid' | 'Pending Verification' | 'Refunded via GCash';
  refundRef?: string;
  status: BookingStatus;
  assignedGuide?: string;
  assignedGuideId?: string;
};

type Guide = {
  id: string;
  name: string;
  specialty: string;
};
```

Seed data: 27 bookings matching screenshot counts (10 To Confirm, 8 Confirmed, 5 Completed, 2 Declined, 2 Refunded). Use names/dates from screenshots + generated variants.

---

## 4. Technology Stack

| Layer | Choice | Why |
|-------|--------|-----|
| **Build** | Vite 5 + React 18 + TypeScript | Fast, zero-config, matches modern hiring stack |
| **Styling** | Tailwind CSS 3.4 (no external UI library) | Pixel control for screenshot replica |
| **Icons** | Lucide-react (Search, Calendar, Clock, Check, etc.) + Heroicons | Lightweight, consistent with design |
| **State** | React useState + useMemo (no Redux) | Local mock state sufficient; easy to lift to Zustand later |
| **Mock API** | In-memory JSON (`src/data/bookings.ts`) + simulated async | No backend needed, but structured for swap to REST |
| **Routing** | Single-page (no router needed) — header tabs are dummy except Bookings | Keeps PR small |
| **Testing** | Vitest + React Testing Library (smoke tests) | Required for PR quality gate |
| **Lint/Format** | ESLint + Prettier | Polish |

**Alternative considered:** Next.js — overkill for single dashboard, adds SSR complexity not needed for admin internal tool.

---

## 5. Component Architecture

```
src/
├── components/
│   ├── Header.tsx              # DAET nav, Bookings/Packages/Revenue tabs
│   ├── FilterBar.tsx           # search + package dropdown + date + status pills
│   ├── BookingTableHeader.tsx  # column labels + select-all
│   ├── BookingCard.tsx         # collapsed + expanded logic
│   ├── BookingDetails.tsx      # 3-column expanded panels
│   ├── StatusPill.tsx          # reusable status badge
│   ├── ApproveModal.tsx        # Assign Eco-Guide modal + capacity banner
│   ├── Toast.tsx               # success notification
│   └── EmptyState.tsx
├── data/
│   ├── bookings.ts             # 27 mock bookings
│   └── guides.ts               # 3 accredited guides
├── hooks/
│   └── useFilteredBookings.ts  # search/filter/memo logic
├── types/
│   └── index.ts
├── App.tsx
├── main.tsx
└── index.css (Tailwind)
```

---

## 6. Core Features & Logic

### 6.1 Filtering
- **Search:** case-insensitive match against `id`, `packageName`, `guestName`, `guestPhone`.
- **Package filter:** dropdown populated from unique package names; default `All Tour Packages`.
- **Date filter:** exact match on `tourDate` (ISO).
- **Status pills:** single-select; counts recomputed after other filters? In screenshot counts are global (27, 10...). We’ll show global counts always, but filtered list reflects active pill.

### 6.2 Expand/Collapse
- Each card has `isExpanded` state (stored as `Set<string>` in parent). Clicking chevron toggles. Only one expanded at a time? Screenshots show one expanded at a time, but we allow multiple for flexibility — default single.

### 6.3 Approval Flow
1. Click `Approve` (card) or `Approve Booking` (expanded) → open `ApproveModal`.
2. Modal shows capacity check (always green for demo; could add random “full” state for edge case).
3. User selects guide (required).
4. Click `Confirm & Send Voucher` → update booking: `status = 'Confirmed'`, `assignedGuide = selected`, `paymentStatus = 'Paid'` if was pending, close modal, show toast.
5. Toast auto-dismiss 4s.

### 6.4 Other Actions
- `Decline` → `status = 'Declined'`
- `Process Refund` → `status = 'Refunded'`, `paymentStatus = 'Refunded via GCash'`, `refundRef = random 10-digit`
- `Call Tourist` → `tel:` link (visual only)
- Checkbox/bulk actions: visual only for v1 (no bulk logic).

### 6.5 Edge Cases
- No results → EmptyState with “No bookings found” + clear filters.
- Invalid guide selection → disable Confirm button.
- Double-approve → guard: if already Confirmed, hide Approve button.

---

## 7. Visual Fidelity Checklist

- [ ] Rounded `2xl` cards, `border-slate-200`, shadow-sm
- [ ] Inter font (Google Fonts) — matches screenshot sans-serif
- [ ] DAET badge `bg-sky-50` `text-sky-700` `border-sky-200`
- [ ] Peso formatting `₱12,500.00` via `Intl.NumberFormat('en-PH', {style:'currency', currency:'PHP'})`
- [ ] Status pills with icons + correct colors
- [ ] Amber To Confirm, Emerald Confirmed, Purple Refunded
- [ ] Smooth expand animation (max-height transition)
- [ ] Modal backdrop `bg-slate-900/40` `backdrop-blur-sm`
- [ ] Responsive: 3-col details → 1-col on mobile

---

## 8. Implementation Phases

### Phase 1 — Scaffold (30 min)
- Vite + React + TS + Tailwind init
- Header + FilterBar shell (static)
- BookingCard static with mock data

### Phase 2 — Interactivity (45 min)
- Filtering logic + status pills
- Expand/collapse
- Modal + guide assignment
- Toast

### Phase 3 — Polish (20 min)
- Pixel tweaks vs screenshots
- Responsive + empty state
- Currency/date formatting

### Phase 4 — Quality (15 min)
- Vitest smoke tests (filter, approve flow)
- ESLint fix
- README + PR description
- Git branch + commit

---

## 9. PR Strategy

- **Branch:** `feature/booking-management-v1` from `main`
- **Base:** `main` (initial commit: scaffold)
- **Commits:** 3 commits → `feat: scaffold booking dashboard`, `feat: implement filtering and approval flow`, `chore: tests and polish`
- **PR Title:** `feat: DAET Connect Booking Management Dashboard`
- **PR Body:** includes screenshots comparison, tech stack, how to run, testing, next steps (API integration).
- **Reviewers:** assign dummy reviewer note.
- **After merge:** deploy preview via Vite preview (or live preview port).

---

## 10. Future Extensions (Out of Scope for v1)
- Real API (`GET /bookings`, `POST /bookings/:id/approve`)
- Auth & role-based access (operator vs admin)
- Bulk actions (export CSV, bulk confirm)
- Pagination (currently 27 → all visible; add pagination at 50+)
- Daily capacity real check (inventory service)
- GCash refund integration

---

## 11. Risks & Mitigations
- **Pixel mismatch:** Use browser screenshot overlay check.
- **No git remote:** Local PR docs generated; user can push to GitHub by adding remote.

---

**Owner:** AI Arena Agent  
**Date:** 2026-11-08  
**Status:** Ready to build → proceed to Phase 1.
