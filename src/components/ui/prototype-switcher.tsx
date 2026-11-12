"use client";

// PROTOTYPE: floating variant switcher for UI prototypes. Never ships: hidden in production.
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

export function PrototypeSwitcher({ variants }: { variants: Array<{ key: string; name: string }> }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = params.get("variant") ?? variants[0].key;
  const index = Math.max(0, variants.findIndex((v) => v.key === current));

  const go = (step: number) => {
    const next = variants[(index + step + variants.length) % variants.length];
    const sp = new URLSearchParams(params.toString());
    sp.set("variant", next.key);
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.closest("input, textarea, select, [contenteditable]"))) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (process.env.NODE_ENV === "production") return null;
  const v = variants[index];
  return (
    <div className="fixed bottom-4 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-3 rounded-full bg-black px-4 py-2 font-mono text-sm text-white shadow-2xl ring-2 ring-yellow-400">
      <button type="button" onClick={() => go(-1)} aria-label="Previous variant">←</button>
      <span>PROTOTYPE {v.key} ({v.name}) · {index + 1}/{variants.length}</span>
      <button type="button" onClick={() => go(1)} aria-label="Next variant">→</button>
    </div>
  );
}
