import Link from "next/link";
import { BrandMark } from "@/components/ui/brand-mark";
import { ButtonLink } from "@/components/ui/button";
import { LogoutButton } from "@/components/ui/logout-button";
import { SiteNavLink } from "@/components/ui/site-nav-link";
import { NotificationBell } from "@/components/tours/notification-bell";
import type { Tab } from "@/lib/tours/dashboards";

const PUBLIC_LINKS = [
  { href: "/tours/plan", label: "Plan a trip" },
  { href: "/tours/attractions", label: "Attractions" },
  { href: "/tours/events", label: "Events" },
  { href: "/tours/merch", label: "Souvenirs" },
];

export function SiteHeader({
  showAdminLink = false,
  signedIn = false,
  tabs = [],
}: {
  showAdminLink?: boolean;
  signedIn?: boolean;
  /** The signed-in user's role tabs. Phones get them in the bottom bar; from md up they show here. */
  tabs?: Tab[];
}) {
  // Tabs that the public links already cover are not repeated.
  const publicHrefs = new Set(PUBLIC_LINKS.map((link) => link.href));
  const roleLinks = tabs.filter((tab) => !publicHrefs.has(tab.href) && tab.label !== "Tours");

  return (
    <header className="border-b border-daet-ink/10 bg-white print:hidden">
      <div className="mx-auto flex min-h-[76px] max-w-7xl flex-wrap items-center justify-between gap-x-4 px-4 py-2 sm:flex-nowrap sm:px-6 lg:px-8">
        <BrandMark />
        {/* On phones the account actions sit beside the logo; on wider screens they follow the nav. */}
        <div className="flex items-center gap-1 sm:order-last sm:gap-2">
          {signedIn ? (
            <>
              <NotificationBell />
              <LogoutButton compact />
            </>
          ) : (
            <>
              <ButtonLink href="/login" variant="secondary" className="px-3! sm:px-4!">
                Log in
              </ButtonLink>
              <ButtonLink href="/signup" className="hidden px-4 sm:inline-flex">
                Sign up
              </ButtonLink>
            </>
          )}
        </div>
        <nav
          className="-mx-1 flex w-full min-w-0 items-center gap-1 overflow-x-auto pb-1 sm:mx-0 sm:w-auto sm:flex-1 sm:gap-2 sm:pb-0 lg:gap-3"
          aria-label="Main navigation"
        >
          {PUBLIC_LINKS.map((link) => (
            <SiteNavLink key={link.href} href={link.href}>
              {link.label}
            </SiteNavLink>
          ))}
          {signedIn ? (
            <>
              {roleLinks.map((tab) => (
                <SiteNavLink key={tab.href} href={tab.href} className="hidden md:inline-flex">
                  {tab.label === "Home" ? "My dashboard" : tab.label}
                </SiteNavLink>
              ))}
              <Link
                href="/dashboard"
                className="hidden min-h-11 shrink-0 items-center whitespace-nowrap rounded-full bg-daet-sand px-4 text-sm font-bold text-daet-forest transition hover:bg-daet-sand/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-daet-forest sm:inline-flex md:hidden"
              >
                My dashboard
              </Link>
            </>
          ) : (
            <>
              <SiteNavLink href="/tours/guide/register">Guides</SiteNavLink>
              <SiteNavLink href="/tours/operator/register">Operators</SiteNavLink>
            </>
          )}
          {showAdminLink ? (
            <>
              <SiteNavLink href="/tours/admin/analytics" className="hidden lg:inline-flex">
                Analytics
              </SiteNavLink>
              <SiteNavLink href="/tours/admin/operators" className="hidden lg:inline-flex">
                Operators
              </SiteNavLink>
              <SiteNavLink href="/tours/admin/guides" className="hidden xl:inline-flex">
                Guides
              </SiteNavLink>
              <SiteNavLink href="/tours/admin/packages" className="hidden xl:inline-flex">
                Packages
              </SiteNavLink>
            </>
          ) : null}
        </nav>
      </div>
    </header>
  );
}
