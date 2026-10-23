import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/components/ui/cn";

/** Cards use rounded-2xl per the team UI standard. */
export function Card({ className, padded = true, ...props }: ComponentProps<"div"> & { padded?: boolean }) {
  return (
    <div
      className={cn("rounded-2xl border border-daet-ink/10 bg-white shadow-sm", padded && "p-5 sm:p-6", className)}
      {...props}
    />
  );
}

export function CardHeader({
  eyebrow,
  title,
  action,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-4 flex items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        {eyebrow ? <p className="text-xs font-black uppercase tracking-[0.16em] text-daet-leaf">{eyebrow}</p> : null}
        <h2 className="mt-1 text-xl font-black text-daet-ink">{title}</h2>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
