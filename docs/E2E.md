# E2E (mock Supabase)

Run `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npm run test:e2e:tours -- <spec files> --trace off`. Pass spec files, since the full suite takes about 20 minutes. Sign in with `signInAs(context, role)` from `e2e/fixtures.ts`.

- **Viewport.** The default is phone width. The role sidebars show from the `lg` breakpoint, so call `page.setViewportSize({ width: 1400, height: 900 })` to see one. At phone width, open the menu drawer instead.
- **Mock data.** `e2e/mock-supabase.cjs` answers every table query and RPC the pages make. A new RPC or table needs a stub there; an unstubbed call returns nothing and the page renders its error state.
- **Log noise.** The web server logs "uncached data during prerendering" errors from `not-found.tsx` and a few public pages. They are not test failures. Search the output for `✘` and `passed`.
- **CI.** The `e2e (375px + axe)` job runs the whole suite. A push cancels the run in progress, so check locally first (`npm run check`, then the specs you touched).
