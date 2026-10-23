import Link from 'next/link';
import { LogoutButton } from './logout-button';

interface DashboardHeaderProps {
  title?: string;
  description?: string;
  backHref?: string;
  backLabel?: string;
  children?: React.ReactNode;
  role?: 'admin' | 'operator' | 'guide' | 'tourist';
}

export function DashboardHeader({
  title,
  description,
  backHref,
  backLabel = 'Back',
  children,
  role,
}: DashboardHeaderProps) {
  const dashboardLinks: Record<string, { home: string; label: string }> = {
    admin: { home: '/tours/admin', label: 'Admin Dashboard' },
    operator: { home: '/tours/operator/dashboard', label: 'Operator Dashboard' },
    guide: { home: '/tours/guide/dashboard', label: 'Guide Dashboard' },
    tourist: { home: '/tours/browse', label: 'Browse Tours' },
  };

  const dashLink = role ? dashboardLinks[role] : null;

  return (
    <>
      {/* Navigation Bar */}
      {role && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-daet-ink/10 bg-white px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
            {dashLink && (
              <Link
                href={dashLink.home}
                className="text-sm font-bold text-daet-forest transition hover:text-daet-ink"
              >
                {dashLink.label}
              </Link>
            )}
            {role === 'operator' && (
              <>
                <span className="text-daet-ink/20">|</span>
                <Link
                  href="/tours/operator/packages"
                  className="text-sm font-bold text-daet-ink/70 transition hover:text-daet-ink"
                >
                  Packages
                </Link>
                <Link
                  href="/tours/operator/bookings"
                  className="text-sm font-bold text-daet-ink/70 transition hover:text-daet-ink"
                >
                  Bookings
                </Link>
                <Link
                  href="/tours/operator/reviews"
                  className="text-sm font-bold text-daet-ink/70 transition hover:text-daet-ink"
                >
                  Reviews
                </Link>
              </>
            )}
            {(role === 'operator' || role === 'guide') && (
              <Link
                href="/tours/messages"
                className="text-sm font-bold text-daet-ink/70 transition hover:text-daet-ink"
              >
                Messages
              </Link>
            )}
          </div>
          <LogoutButton />
        </div>
      )}

      {/* Header Section */}
      {(title || description || backHref || children) && (
        <div className="mb-8">
          {backHref && (
            <div className="mb-4">
              <Link
                href={backHref}
                className="inline-flex items-center text-sm font-medium text-daet-ink/70 transition hover:text-daet-ink"
              >
                <svg className="mr-1 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                {backLabel}
              </Link>
            </div>
          )}
          
          <div className="flex items-start justify-between">
            <div className="flex-1">
              {title && <h1 className="text-3xl font-bold text-daet-ink">{title}</h1>}
              {description && (
                <p className="mt-2 text-daet-ink/70">{description}</p>
              )}
            </div>
            {children && (
              <div className="ml-4">
                {children}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
