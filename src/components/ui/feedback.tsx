"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ConfirmDialog } from "@/components/ui/modal";
import type { ButtonVariant } from "@/components/ui/button";

/**
 * Toasts and confirmation dialogs for client components. They replace the
 * browser's alert() and confirm(), which block the page, cannot be styled and
 * are announced inconsistently.
 *
 *   const { toast, confirm } = useFeedback();
 *   toast("Payment recorded", "success");
 *   if (await confirm({ title: "Delete this stop?" })) { ... }
 */

type ToastKind = "success" | "error" | "info";
type ToastItem = { id: number; kind: ToastKind; message: ReactNode };

export type ConfirmOptions = {
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: ReactNode;
  cancelLabel?: ReactNode;
  confirmVariant?: ButtonVariant;
};

type Feedback = {
  toast: (message: ReactNode, kind?: ToastKind) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

const FeedbackContext = createContext<Feedback | null>(null);

const TOAST_STYLES: Record<ToastKind, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-950",
  error: "border-rose-200 bg-rose-50 text-rose-950",
  info: "border-sky-200 bg-sky-50 text-sky-950",
};

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [pending, setPending] = useState<{ options: ConfirmOptions; resolve: (value: boolean) => void } | null>(null);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((item) => item.id !== id));
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const toast = useCallback(
    (message: ReactNode, kind: ToastKind = "info") => {
      const id = nextId.current++;
      setToasts((current) => [...current.slice(-2), { id, kind, message }]);
      // Errors stay longer: they usually need to be read twice.
      timers.current.set(id, setTimeout(() => dismiss(id), kind === "error" ? 9000 : 5000));
    },
    [dismiss],
  );

  const confirm = useCallback(
    (options: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ options, resolve })),
    [],
  );

  useEffect(() => {
    const active = timers.current;
    return () => active.forEach((timer) => clearTimeout(timer));
  }, []);

  const settle = (value: boolean) => {
    pending?.resolve(value);
    setPending(null);
  };

  const value = useMemo<Feedback>(() => ({ toast, confirm }), [toast, confirm]);

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 sm:bottom-6 print:hidden">
        {toasts.map((item) => (
          <div
            key={item.id}
            role={item.kind === "error" ? "alert" : "status"}
            className={`pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl border p-4 text-sm font-semibold shadow-card ${TOAST_STYLES[item.kind]}`}
          >
            <span className="flex-1">{item.message}</span>
            <button
              type="button"
              onClick={() => dismiss(item.id)}
              aria-label="Dismiss message"
              className="-m-2 min-h-11 min-w-11 rounded-full text-lg leading-none hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-daet-forest"
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
        ))}
      </div>
      <ConfirmDialog
        open={pending !== null}
        title={pending?.options.title ?? ""}
        description={pending?.options.description}
        confirmLabel={pending?.options.confirmLabel ?? "Confirm"}
        cancelLabel={pending?.options.cancelLabel ?? "Cancel"}
        confirmVariant={pending?.options.confirmVariant ?? "danger"}
        onConfirm={() => settle(true)}
        onCancel={() => settle(false)}
      />
    </FeedbackContext.Provider>
  );
}

// Used when a component renders outside the provider (for example in an
// isolated test): fall back to the browser dialogs so nothing breaks.
const FALLBACK: Feedback = {
  toast: (message) => {
    if (typeof window !== "undefined" && typeof message === "string") window.alert(message);
  },
  confirm: async ({ title }) => typeof window !== "undefined" && typeof title === "string" && window.confirm(title),
};

export function useFeedback(): Feedback {
  return useContext(FeedbackContext) ?? FALLBACK;
}
