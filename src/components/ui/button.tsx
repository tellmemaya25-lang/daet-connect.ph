import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/components/ui/cn";

/**
 * Buttons follow the team UI standard: rounded-full, at least 44px tall
 * (min-h-11), bold label. Use `ButtonLink` for navigation so the same styles
 * apply to <a>.
 */
const VARIANTS = {
  primary: "bg-daet-forest text-white hover:bg-daet-ink",
  secondary: "border border-daet-forest/30 bg-white text-daet-forest hover:bg-daet-forest/5",
  ghost: "text-daet-ink hover:bg-daet-sand",
  danger: "border border-rose-200 bg-white text-rose-700 hover:bg-rose-50",
  accent: "bg-daet-sun text-daet-ink hover:bg-amber-300",
} as const;

const SIZES = {
  md: "min-h-11 px-6 text-sm",
  lg: "min-h-12 px-7 text-base",
  icon: "h-11 w-11 text-lg",
} as const;

export type ButtonVariant = keyof typeof VARIANTS;
export type ButtonSize = keyof typeof SIZES;

type StyleProps = { variant?: ButtonVariant; size?: ButtonSize; fullWidth?: boolean };

export function buttonClasses({ variant = "primary", size = "md", fullWidth = false }: StyleProps = {}): string {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-full font-bold transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-daet-forest/40 focus-visible:ring-offset-2",
    "disabled:cursor-not-allowed disabled:opacity-60",
    VARIANTS[variant],
    SIZES[size],
    fullWidth && "w-full",
  );
}

export function Button({
  variant,
  size,
  fullWidth,
  loading = false,
  loadingText,
  className,
  children,
  disabled,
  type = "button",
  ...props
}: ComponentProps<"button"> & StyleProps & { loading?: boolean; loadingText?: ReactNode }) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(buttonClasses({ variant, size, fullWidth }), className)}
      {...props}
    >
      {loading ? (
        <>
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden="true" />
          {loadingText ?? children}
        </>
      ) : (
        children
      )}
    </button>
  );
}

export function ButtonLink({
  variant,
  size,
  fullWidth,
  className,
  ...props
}: ComponentProps<typeof Link> & StyleProps) {
  return <Link className={cn(buttonClasses({ variant, size, fullWidth }), className)} {...props} />;
}
