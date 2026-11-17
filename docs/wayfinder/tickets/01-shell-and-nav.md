---
label: wayfinder:grilling
status: closed
blocked-by: [02-research-screens-a, 03-research-screens-b, 04-research-screens-c]
---
## Question
What is the shared admin shell for every board (sidebar groups and links, top bar, breadcrumb, page header pattern, list and form templates), and how do boards reference it so 20+ boards stay consistent?

## Resolution
Decided with the user ("go with your recommendations"):
1. Sidebar, three collapsible groups: **Overview** (Dashboard, Analytics); **People & trips** (Operators, Guides, Packages, Reviews, with waiting counts); **Content** (Attractions, Guide places, Events, Fares, Souvenirs).
2. Shared shell: test whether a board can load a shared shell file (see ticket 06). If not, each board repeats the shell copied verbatim from `Main.dc.html`, changing only the active link and breadcrumb.
3. Header: breadcrumb (Admin / Section / Page) in the sticky top bar; title row below with the title at left and one filled primary button at right. Review-only sections (Operators, Reviews, Guides) have no primary button.
4. List: filter chips, count line, table with a status-pill column and right-aligned actions, Previous/Next pagination (20 per page). No sort control unless the real screen has one. Empty and error states appear as notice rows on the dashboard board only.
5. Form: full page, narrow card (about 672px), labels above inputs, footer with a filled Save and a text Cancel. New and edit share one layout; the edit board shows filled fields.
