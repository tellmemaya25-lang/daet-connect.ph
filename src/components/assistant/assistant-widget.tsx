"use client";

import { LineIcon } from "@/components/ui/icons";
import { useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AssistantChat } from "@/components/assistant/assistant-chat";

/** Pages where a floating chat button would get in the way. */
const HIDDEN = [/^\/login/, /^\/signup/, /^\/forgot-password/, /^\/tours\/help/, /^\/tours\/messages\/[^/]+$/, /^\/tours\/guide\/check-in/, /\/ticket$/];

/**
 * Floating "Ask the assistant" button on every page, opening the travel
 * assistant in a dialog (full screen on phones, a side panel from sm up).
 * The native <dialog> traps focus and closes on Escape.
 */
export function AssistantWidget({ signedIn, raised }: { signedIn: boolean; raised: boolean }) {
  const pathname = usePathname() ?? "";
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  if (HIDDEN.some((pattern) => pattern.test(pathname))) return null;

  const close = () => dialogRef.current?.close();

  return (
    <>
      <button
        type="button"
        onClick={() => {
          dialogRef.current?.showModal();
          setOpen(true);
        }}
        aria-haspopup="dialog"
        className={`fixed right-4 z-40 inline-flex h-12 min-w-12 items-center justify-center gap-2 rounded-full bg-blue-600 px-3 text-sm font-bold text-white shadow-[var(--shadow-float)] transition hover:bg-blue-700 active:scale-95 sm:bottom-6 sm:right-6 sm:px-4 print:hidden ${raised ? "bottom-20" : "bottom-4"}`}
      >
        <LineIcon name="chat" className="h-6 w-6 sm:h-5 sm:w-5" />
        <span className="sr-only sm:not-sr-only">Ask the assistant</span>
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby="assistant-title"
        onClose={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === dialogRef.current) close();
        }}
        className="m-0 h-dvh max-h-dvh w-full max-w-full bg-white p-0 text-daet-ink backdrop:bg-daet-ink/40 sm:ml-auto sm:h-dvh sm:w-[26rem] sm:max-w-[26rem] sm:rounded-l-3xl"
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between gap-3 bg-daet-forest px-4 py-3 text-white">
            <div>
              <h2 id="assistant-title" className="text-base font-bold">
                Daet travel assistant
              </h2>
              <p className="text-xs text-white">Here 24/7 · answers from CONNECT-Daet&apos;s listings</p>
            </div>
            <button type="button" onClick={close} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-lg hover:bg-white/10" aria-label="Close the assistant">
              ✕
            </button>
          </div>
          {open ? <AssistantChat signedIn={signedIn} onNavigate={close} autoFocus /> : null}
        </div>
      </dialog>
    </>
  );
}
