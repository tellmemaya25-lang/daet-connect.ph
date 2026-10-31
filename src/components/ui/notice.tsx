import type { ReactNode } from "react";

/** Tinted fields in the standard's status colours; no border. */
const variants = {
  info: "bg-blue-50 dark:bg-blue-950/40 text-blue-950 dark:text-blue-300",
  warning: "bg-yellow-50 dark:bg-yellow-950/40 text-yellow-950 dark:text-yellow-200",
  success: "bg-green-50 dark:bg-green-950/40 text-green-950 dark:text-green-300",
  error: "bg-red-50 dark:bg-red-950/40 text-red-950 dark:text-red-300",
} as const;

export function Notice({
  variant = "info",
  title,
  children,
  className = "",
}: {
  variant?: keyof typeof variants;
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div role={variant === "error" ? "alert" : "status"} className={`rounded-2xl p-4 ${variants[variant]} ${className}`}>
      {title ? <p className="font-bold">{title}</p> : null}
      <div className={title ? "mt-1 text-sm leading-6" : "text-sm leading-6"}>{children}</div>
    </div>
  );
}
