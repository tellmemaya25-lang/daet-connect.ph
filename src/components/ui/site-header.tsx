import Link from "next/link";
import { BrandMark } from "@/components/ui/brand-mark";

export function SiteHeader({ showAdminLink = false }: { showAdminLink?: boolean }) {
  return (
    <header className="bg-white print:hidden">
      <div className="mx-auto flex min-h-[76px] max-w-7xl flex-wrap items-center justify-between gap-x-4 px-4 py-2 sm:flex-nowrap sm:px-6 lg:px-8">
        <BrandMark />
        <nav className="-mx-1 flex w-full items-center gap-1 overflow-x-auto pb-1 sm:mx-0 sm:w-auto sm:gap-2 sm:overflow-visible sm:pb-0 lg:gap-4" aria-label="Main navigation">
          <Link
            href="/tours/events"
            className="inline-flex min-h-11 shrink-0 items-center rounded-full px-3 text-sm font-semibold text-daet-ink transition hover:bg-daet-sand sm:px-4"
          >
            Events
          </Link>
          <Link
            href="/tours/merch"
            className="inline-flex min-h-11 shrink-0 items-center rounded-full px-3 text-sm font-semibold text-daet-ink transition hover:bg-daet-sand sm:px-4"
          >
            Merch
          </Link>
          <Link
            href="/tours/guide/register"
            className="inline-flex min-h-11 shrink-0 items-center rounded-full px-3 text-sm font-semibold text-daet-ink transition hover:bg-daet-sand sm:px-4"
          >
            Guides
          </Link>
          <Link
            href="/tours/operator/register"
            className="inline-flex min-h-11 shrink-0 items-center rounded-full px-3 text-sm font-semibold text-daet-ink transition hover:bg-daet-sand sm:px-4"
          >
            Operators
          </Link>
          {showAdminLink ? (
            <>
              <Link
                href="/tours/admin"
                className="hidden min-h-11 items-center rounded-full bg-daet-forest px-4 text-sm font-semibold text-white transition hover:bg-daet-ink md:inline-flex"
              >
                Admin Dashboard
              </Link>
              <Link
                href="/tours/admin/operators"
                className="hidden min-h-11 items-center rounded-full border border-daet-forest/20 px-4 text-sm font-semibold text-daet-forest transition hover:bg-daet-forest/5 md:inline-flex"
              >
                Operators
              </Link>
              <Link
                href="/tours/admin/guides"
                className="hidden min-h-11 items-center rounded-full border border-daet-forest/20 px-4 text-sm font-semibold text-daet-forest transition hover:bg-daet-forest/5 md:inline-flex"
              >
                Guides
              </Link>
              <Link
                href="/tours/admin/packages"
                className="hidden min-h-11 items-center rounded-full border border-daet-forest/20 px-4 text-sm font-semibold text-daet-forest transition hover:bg-daet-forest/5 md:inline-flex"
              >
                Packages
              </Link>
            </>
          ) : null}
        </nav>
      </div>
    </header>
  );
}
