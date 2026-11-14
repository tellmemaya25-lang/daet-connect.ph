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

## Not yet specified
- One board per section (list and form screens): the build tickets. They graduate once the shell and sample-data decisions are made.
- Canvas layout of ~22 boards (grid, naming, order in `canvas.json`).
- Whether the phone board needs admin screens beyond the dashboard.

## Out of scope
- Changing the real app code in `src/`.
- Wiring boards to live data.
