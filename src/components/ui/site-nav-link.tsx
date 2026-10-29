"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";

const BASE =
  "inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full px-3 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-daet-forest sm:px-4";

/** Header link that marks the current page for assistive tech and sighted users. */
export function SiteNavLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  const pathname = usePathname() ?? "";
  const current = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={cn(BASE, current ? "bg-daet-sand text-daet-forest" : "text-daet-ink hover:bg-daet-sand", className)}
    >
      {children}
    </Link>
  );
}
