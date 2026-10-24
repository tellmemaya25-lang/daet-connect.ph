import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/components/ui/cn";

/**
 * Form controls. Text is 16px (text-base) so iOS does not zoom on focus, and
 * controls are at least 44px tall. Pass `invalid` to show the error state;
 * `Field` wires the label, hint and error message to the control by id.
 */
export const controlClasses =
  "mt-1 block min-h-11 w-full rounded-xl border border-daet-ink/20 bg-white px-3 py-2 text-base text-daet-ink placeholder:text-daet-ink/40 focus:border-daet-forest focus:outline-none focus:ring-2 focus:ring-daet-forest/20 disabled:bg-daet-sand/60 aria-[invalid=true]:border-rose-500";

export function fieldDescribedBy(id: string, { hint, error }: { hint?: ReactNode; error?: ReactNode }) {
  if (error) return `${id}-error`;
  if (hint) return `${id}-hint`;
  return undefined;
}

export function Field({
  id,
  label,
  hint,
  error,
  required = false,
  className,
  children,
}: {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm font-bold text-daet-ink">
        {label}
        {required ? (
          <span className="text-rose-600" aria-hidden="true">
            {" "}*
          </span>
        ) : null}
      </label>
      {children}
      {hint && !error ? (
        <p id={`${id}-hint`} className="mt-1 text-xs text-daet-ink/70">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-sm font-semibold text-rose-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

type ControlProps = { invalid?: boolean };

export function Input({ invalid, className, ...props }: ComponentProps<"input"> & ControlProps) {
  return <input aria-invalid={invalid || undefined} className={cn(controlClasses, className)} {...props} />;
}

export function Textarea({ invalid, className, ...props }: ComponentProps<"textarea"> & ControlProps) {
  return <textarea aria-invalid={invalid || undefined} className={cn(controlClasses, className)} {...props} />;
}

export function Select({ invalid, className, ...props }: ComponentProps<"select"> & ControlProps) {
  return <select aria-invalid={invalid || undefined} className={cn(controlClasses, className)} {...props} />;
}
