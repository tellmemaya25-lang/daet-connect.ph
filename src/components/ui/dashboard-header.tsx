import Link from "next/link";
import { LineIcon } from "@/components/ui/icons";

interface DashboardHeaderProps {
  title?: string;
  description?: string;
  backHref?: string;
  backLabel?: string;
  children?: React.ReactNode;
  role?: "admin" | "operator" | "guide" | "tourist";
}

const ROLE_LINKS: Record<NonNullable<DashboardHeaderProps["role"]>, { href: string; label: string }[]> = {
  admin: [{ href: "/tours/admin", label: "Dashboard" }],
  operator: [
    { href: "/tours/operator/dashboard", label: "Dashboard" },
    { href: "/tours/operator/packages", label: "Packages" },
    { href: "/tours/operator/bookings", label: "Bookings" },
    { href: "/tours/operator/reviews", label: "Reviews" },
    { href: "/tours/messages", label: "Messages" },
  ],
  guide: [
    { href: "/tours/guide/dashboard", label: "Dashboard" },
    { href: "/tours/messages", label: "Messages" },
  ],
  tourist: [{ href: "/tours/browse", label: "Browse trips" }],
};

/** A role's quick links as one row of pills, then an optional back link, title and actions. */
export function DashboardHeader({ title, description, backHref, backLabel = "Back", children, role }: DashboardHeaderProps) {
  return (
    <>
      {role ? (
        <nav aria-label="Work areas" className="-mx-4 mb-6 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <ul className="flex w-max gap-2">
            {ROLE_LINKS[role].map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="inline-flex min-h-11 items-center rounded-full bg-surface px-4 text-[15px] font-bold text-daet-ink transition hover:bg-blue-50 dark:hover:bg-blue-950/40 active:scale-[0.98]"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      {title || description || backHref || children ? (
        <div className="mb-8">
          {backHref ? (
            <Link href={backHref} className="mb-3 inline-flex min-h-11 items-center gap-1 font-bold text-blue-700 dark:text-blue-300 hover:underline">
              <LineIcon name="arrowRight" className="h-4 w-4 rotate-180" />
              {backLabel}
            </Link>
          ) : null}
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0 flex-1">
              {title ? <h1 className="display-2 text-daet-ink">{title}</h1> : null}
              {description ? <p className="mt-2 text-lg text-daet-ink">{description}</p> : null}
            </div>
            {children ? <div className="flex flex-wrap gap-2">{children}</div> : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
