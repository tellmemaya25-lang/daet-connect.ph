# Plan: Fix the cut-off booking card on the trip detail page

## Problem

On desktop (`lg` and up) the sticky "Book this trip" card on a tour package page is clipped at the top. The "From" label is hidden under the site header, and the price sits right against the header's bottom edge. The screenshot shows only the tail of the "From" text above ₱850.00.

Page: `/tours/packages/[id]`

## Root cause (verified in code)

- `src/components/ui/site-header.tsx:93` renders the header as `sticky top-0 z-40` with `min-h-14` (56px) on mobile and `sm:min-h-[3.8rem]` (about 61px) from `sm` up. It has a translucent background and `backdrop-blur`.
- `src/app/(subsystems)/tours/packages/[id]/page.tsx:362` renders the card wrapper as `sticky top-6`. That is a 24px offset.
- 24px is less than the header's roughly 61px height, so once the user scrolls, the card sticks 37px or more underneath the header. The header paints on top of it (`z-40`), which clips the "From" label and the card's top padding and border.

## Fix

Offset the sticky card by the header height plus a gap. Do not hard-code a magic number in only one place.

1. **Preferred: define a shared header-height CSS variable.**
   - In the global stylesheet (find it with `grep -rn "shadow-header\|--shadow-float" src`), add `--header-h: 3.5rem;` on `:root`, and `--header-h: 3.8rem;` inside `@media (min-width: 640px)`. This matches the header's `min-h-14` and `sm:min-h-[3.8rem]`.
   - Use `min-h-[var(--header-h)]` in `site-header.tsx:94`, replacing the two hard-coded min-height classes, so the header and the card offset cannot drift apart.
   - Change the card wrapper at `page.tsx:362` to `sticky top-[calc(var(--header-h)+1.5rem)]`.
2. **Minimal alternative:** if the variable is too invasive, change `top-6` to `top-24` (96px). That clears the 61px header and leaves a gap. This is fine as a stopgap, but note that it hard-codes the coupling.
3. **Short-viewport guard.** The card contains a price, a button and 3 bullet lines, about 380px tall. On laptop viewports about 600px high, the sticky offset plus the card height can overflow the screen and cut off the bottom. Add `max-h-[calc(100dvh-var(--header-h)-3rem)] overflow-y-auto` to the card wrapper, or confirm it fits at 1366×600. Use whichever is simpler.
4. **Anchor links.** If the page links to in-page sections such as `#reviews`, add `scroll-mt-[calc(var(--header-h)+1rem)]` to those targets. This is optional and out of scope unless it is a one-line change.

## Files to change

| File | Change |
|---|---|
| `src/app/(subsystems)/tours/packages/[id]/page.tsx` (line 362) | Replace `top-6` with the header-aware offset. Add the max-height guard. |
| `src/components/ui/site-header.tsx` (line 94) | Only for the preferred option: use `--header-h` for the min-height. |
| Global CSS file that defines `--shadow-float` | Only for the preferred option: define `--header-h`. |

## Constraints

- **Read `AGENTS.md` first.** This repo uses a modified Next.js. Check `node_modules/next/dist/docs/` before writing any Next-specific code. This fix is CSS-only, so it should not be affected.
- Keep dark-mode and light-mode styling unchanged. Only the offset and overflow behavior should change.
- Do not change the mobile bottom bar (`page.tsx:384`). It is a separate `fixed` element, and it is not part of this bug.
- Keep the change small. Do not refactor the page layout.
- Search for other sticky sidebars under `src/app` (`grep -rn "sticky top-" src`). If another sidebar uses the same `top-6` pattern under the header, fix it the same way. Mention it in the summary if you do.

## Verification

1. Run `npm run dev` and open any `/tours/packages/<id>` page at 1280×720. Scroll down through the "What's included" section and the itinerary. The card must keep its full top border, the "From" label, the price and the button visible, with a visible gap below the header.
2. Repeat at 1024×600 (just over the `lg` breakpoint, short viewport). The whole card must remain reachable, either fully visible or scrollable inside itself.
3. Repeat at 1920×1080 to confirm there is no regression on tall screens.
4. Check dark and light themes.
5. Resize below 1024px. The card should be hidden and the fixed bottom bar should appear, unchanged.
6. Run `npm run lint` and `npm run build`. Both must pass.
7. Take before and after screenshots at 1280×720 while scrolled, and attach them to the PR or summary.

## Acceptance criteria

- At every desktop width of 1024px or more, the booking card is never overlapped by the site header while the user scrolls.
- The "From" label, the price, the "Book this trip" button and all three benefit lines are visible or reachable.
- No visual change to the card when the page is at the top.
- Lint and build pass.
