import Link from "next/link";
import { LineIcon } from "@/components/ui/icons";

interface DashboardHeaderProps {
  title?: string;
  description?: string;
  backHref?: string;
  backLabel?: string;
  children?: React.ReactNode;
}

/** An optional back link, title and actions. Work areas live in the header and tab bar. */
export function DashboardHeader({ title, description, backHref, backLabel = "Back", children }: DashboardHeaderProps) {
  return (
    <>
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
