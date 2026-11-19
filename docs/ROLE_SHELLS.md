# Role shells

Admins, operators and guides each get the same frame: a collapsible sidebar on desktop, a sticky top bar, a menu drawer on phones, and the bottom tab bar kept on phones.

## Pieces

- `src/components/shell/app-shell.tsx` (client) draws the sidebar, top bar and drawer from a `ShellConfig` (`shell/nav.ts`): label, home link, nav groups, the cookie that remembers a collapsed sidebar, an optional foldable group. The top bar's search is a slot.
- `src/components/shell/role-frame.tsx` (server) wraps it with the role's `RoleTabBar` (before the shell, so the drawer covers the bar), the live poller and `RoleClaimSync`. With `accountInTabBar` (operators) the account menu is the tab bar's last tab (You) on phones, and the top bar shows the avatar from `sm` up only.
- Each role has a config plus a thin frame: `components/admin/`, `components/operator/`, `components/guide/` (`nav.ts`, `*-frame.tsx`, `*-search.tsx`). A fourth shell is a config and a frame like these, plus the role name in `RoleFrame`'s `role` prop.
- `components/shell/record-search.tsx` is the shared top-bar search (type and status filters, Ctrl+Space, two-character minimum). Each role supplies its lists and a results page.
- `components/ui/page-frame.tsx`: `PageFrame` picks the frame by the viewer's role. Pass `plain` to keep the public header (the pending and register pages).

## Which frame a page gets

- Admin pages sit under `tours/admin/`, whose `layout.tsx` supplies `AdminFrame`.
- Operator and guide pages call `<PageFrame>` themselves.
- Pages in the `(signed-in)` route group get `SignedInFrame`: the public header and a cached layout. They cannot be given a role shell, so a role's own pages live outside that group.
- Shared pages need a role copy inside the shell, with a redirect from the shared URL: messages (`tours/messages` → `tours/<role>/messages`, in `messages/inbox-view.tsx`), my bookings and plan for admins.
- `src/app/login/actions.ts` (`landingFor`) sends each role to its dashboard after sign-in.
- `src/proxy.ts` lists the signed-in pages that redirect visitors to sign in.

## Adding a sidebar link

Add the area to the role's `nav.ts` when its page exists. `shell/nav-pages.test.ts` fails when a link has no page. Icons are in `components/ui/icons.tsx`.

## Gotchas

- Request-time role checks go inside `<Suspense>` (cacheComponents); `src/app/loading.tsx` covers async pages.
- Phone width: check 375px for sideways overflow in tables; long unbroken text needs `[overflow-wrap:anywhere]`; grid items need `min-w-0`.
- The Home tab shows active on pages that have no tab of their own.
