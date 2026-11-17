---
label: wayfinder:map
---
# Map: Admin screens prototype

## Destination
Every admin screen of the Daet Connect tours admin (all 10 sections plus Dashboard and Analytics: list screen and new/edit form, about 22 screens) exists as a desktop board in the "Admin Dashboard Prototype" Design canvas artifact (https://claude.ai/code/artifact/9c3b5ba7-a5a5-458b-b887-98f137b4ce76), built from the connect-daet design system, sharing one shell and one set of sample data.

## Notes
- Source of truth for screens: `src/app/(subsystems)/tours/admin/**`. Prototype only; no repo code changes.
- Existing `Main.dc.html` is the dashboard and defines the shell (sidebar, top bar). New boards reuse it.
- Sample content stays labelled as sample. Sentence case, 44px touch targets, no resting shadows.
- Agents: Opus (low effort) for planning tickets, Sonnet (medium effort) for grunt work (research, board building).
- Never resolve more than one ticket per session, except research.

## Decisions so far
- [Research screens A](tickets/02-research-screens-a.md): inventory of Operators, Packages (list, detail), Reviews, Guides is in `research/screens-a.md`.
- [Research screens B](tickets/03-research-screens-b.md): inventory of Attractions, Guide places, Events (list, form, status labels) is in `research/screens-b.md`.
- [Research screens C](tickets/04-research-screens-c.md): inventory of Fares (with CSV import), Merch, Dashboard, Analytics is in `research/screens-c.md`.
- [Shell and nav](tickets/01-shell-and-nav.md): three sidebar groups, breadcrumb + title/primary-button header, filter-chip table lists, narrow-card forms; shell shared if boards can include it, otherwise copied.
- [Sample data](tickets/05-sample-data.md): one shared dataset in `sample-data.md`; today is 14 Nov 2026; 6 waiting items tie dashboard to lists.
- [Shared shell include](tickets/06-shared-shell-include.md): yes via `<dc-import>`, but no slots, so two shared components (`Sidebar`, `TopBar`) instead of one shell; not yet rendered.

- [Board builds](tickets/07-build-boards-people.md): 21 boards (tickets 07, 08, 09) published and placed on the canvas, one row per section from y=3000, 1800 apart, columns 1360 apart. Unrendered.

## Not yet specified
- Render check: whether the Sidebar/TopBar imports and sidebar collapse actually work, and real board heights.
- Dashboard (`Main.dc.html`) still uses its old sidebar grouping, not the shared Sidebar.
- Whether the phone board needs admin screens beyond the dashboard.

## Out of scope
- Changing the real app code in `src/`.
- Wiring boards to live data.
