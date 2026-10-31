import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";

/**
 * Status colours from the team standard: success green-500, warning
 * yellow-500, error red-600, primary blue-600. Green and yellow carry dark
 * text, because white on them fails contrast.
 */
const TONES = {
  neutral: "bg-muted-strong text-slate-900 dark:text-slate-100",
  brand: "bg-blue-600 text-white",
  success: "bg-green-500 text-slate-950",
  warning: "bg-yellow-500 text-slate-950",
  danger: "bg-red-600 text-white",
  info: "bg-blue-100 dark:bg-blue-900/40 text-blue-900 dark:text-blue-300",
} as const;

export type BadgeTone = keyof typeof TONES;

export function Badge({ tone = "neutral", className, children }: { tone?: BadgeTone; className?: string; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold", TONES[tone], className)}>
      {children}
    </span>
  );
}
