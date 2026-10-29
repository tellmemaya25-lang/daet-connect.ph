import type { ReactNode } from "react";

/** Tinted fields in the standard's status colours; no border. */
const variants = {
  info: "bg-blue-50 text-blue-950",
  warning: "bg-yellow-50 text-yellow-950",
  success: "bg-green-50 text-green-950",
  error: "bg-red-50 text-red-950",
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
