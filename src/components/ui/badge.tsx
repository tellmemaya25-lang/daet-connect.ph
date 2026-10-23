import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";

const TONES = {
  neutral: "bg-slate-100 text-slate-700",
  brand: "bg-daet-sand text-daet-forest",
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-800",
  danger: "bg-rose-50 text-rose-700",
  info: "bg-sky-50 text-sky-800",
} as const;

export type BadgeTone = keyof typeof TONES;

export function Badge({ tone = "neutral", className, children }: { tone?: BadgeTone; className?: string; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold", TONES[tone], className)}>
      {children}
    </span>
  );
}
