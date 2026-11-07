"use client";

import { useEffect } from "react";

/**
 * Asks the browser to confirm when the operator closes the tab or reloads with
 * work that has not been saved. In-app links are guarded by the confirm dialog
 * in the wizard itself; this covers the cases the app cannot intercept.
 */
export function useUnsavedChangesGuard(hasUnsavedChanges: boolean) {
  useEffect(() => {
    if (!hasUnsavedChanges) return;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Older browsers need returnValue to be set for the prompt to appear.
      event.returnValue = "";
      return "";
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasUnsavedChanges]);
}
