import { BrandMark } from "@/components/ui/brand-mark";
import { ButtonLink } from "@/components/ui/button";
import { LogoutButton } from "@/components/ui/logout-button";
import { MobileMenu, type MenuLink } from "@/components/ui/mobile-menu";
import { UnreadMessagesBadge } from "@/components/chat/unread-badge";
import { SiteNavLink } from "@/components/ui/site-nav-link";
import { NotificationBell } from "@/components/tours/notification-bell";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import type { DashboardRole, Tab } from "@/lib/tours/dashboards";

/** What a visitor or tourist came for. Staff don't get it (adviser revision R1). */
const PUBLIC_LINKS: MenuLink[] = [
  { href: "/tours/browse", label: "Trips" },
  { href: "/tours/plan", label: "Plan a trip" },
  { href: "/tours/attractions", label: "Places" },
  { href: "/tours/events", label: "Events" },
  { href: "/tours/merch", label: "Souvenirs" },
];

const JOIN_LINKS: MenuLink[] = [
  { href: "/tours/operator/register", label: "Run tours: apply as an operator" },
  { href: "/tours/guide/register", label: "Guide tours: apply as a guide" },
];

const ADMIN_LINKS: MenuLink[] = [
  { href: "/tours/admin/analytics", label: "Analytics" },
  { href: "/tours/admin/operators", label: "Operators" },
  { href: "/tours/admin/guides", label: "Guides" },
  { href: "/tours/admin/packages", label: "Packages" },
];

/**
 * Mobile first: on phones the bar holds the wordmark, the account control and
 * a Menu sheet; signed-in users also have the bottom tab bar. From md up the
 * links sit in the bar.
 */
export function SiteHeader({
  showAdminLink = false,
  signedIn = false,
  role,
  tabs = [],
}: {
  showAdminLink?: boolean;
  signedIn?: boolean;
  /** Signed-in role. Staff (operator, guide, admin) don't get the tourist exploration menu (R1). */
  role?: DashboardRole;
  /** The signed-in user's role tabs. Phones get them in the bottom bar; from md up they show here. */
  tabs?: Tab[];
}) {
  const publicLinks = !signedIn || !role || role === "tourist" ? PUBLIC_LINKS : [];
  const publicHrefs = new Set(publicLinks.map((link) => link.href));
  const roleLinks = tabs
    .filter((tab) => !publicHrefs.has(tab.href))
    .map((tab) => ({ href: tab.href, label: tab.label === "Home" ? "My dashboard" : tab.label }));
  const adminLinks = showAdminLink ? ADMIN_LINKS : [];

  return (
    <header className="relative z-40 bg-surface print:hidden">
      <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:min-h-20 sm:px-6 lg:px-8">
        <BrandMark />
        <nav aria-label="Main navigation" className="hidden min-w-0 flex-1 items-center gap-1 md:flex lg:gap-2">
          {publicLinks.map((link) => (
            <SiteNavLink key={link.href} href={link.href}>
              {link.label}
            </SiteNavLink>
          ))}
          {signedIn
            ? roleLinks.map((link) => (
                <SiteNavLink key={link.href} href={link.href}>
                  {link.label}
                  {link.href === "/tours/messages" ? <UnreadMessagesBadge className="ml-1.5" /> : null}
                </SiteNavLink>
              ))
            : null}
          {adminLinks.map((link) => (
            <SiteNavLink key={link.href} href={link.href} className="hidden xl:inline-flex">
              {link.label}
            </SiteNavLink>
          ))}
        </nav>
        <div className="flex items-center gap-1 sm:gap-2">
          <ThemeToggle className="hidden md:grid" />
          {signedIn ? (
            <>
              <NotificationBell />
              <LogoutButton compact />
            </>
          ) : (
            <>
              <ButtonLink href="/login" variant="secondary" className="whitespace-nowrap px-4!">
                Sign in
              </ButtonLink>
              {/* A wrapper hides it on phones; on the link itself "hidden" would fight the button's inline-flex. */}
              <span className="hidden sm:contents">
                <ButtonLink href="/signup" className="whitespace-nowrap px-5">
                  Sign up
                </ButtonLink>
              </span>
            </>
          )}
          <MobileMenu
            groups={[
              { label: "Explore Daet", links: publicLinks },
              { label: "Your work", links: signedIn ? roleLinks : [] },
              { label: "Tourism Office", links: adminLinks },
              { label: "Join CONNECT-Daet", links: signedIn ? [] : JOIN_LINKS },
            ]}
          />
        </div>
      </div>
    </header>
  );
}
