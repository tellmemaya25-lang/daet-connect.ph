import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-2xl border border-dashed border-daet-ink/20 bg-white p-8 text-center", className)}>
      {icon ? (
        <p className="text-4xl" aria-hidden="true">
          {icon}
        </p>
      ) : null}
      <p className="mt-2 font-bold text-daet-ink">{title}</p>
      {description ? <p className="mt-1 text-sm text-daet-ink/60">{description}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
