/**
 * Header sheets (notifications, the phone menu) announce when they open so
 * floating buttons can step aside instead of covering them.
 */
export const OVERLAY_EVENT = "daet:overlay";

export type OverlayDetail = { id: string; open: boolean };

export function announceOverlay(id: string, open: boolean) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<OverlayDetail>(OVERLAY_EVENT, { detail: { id, open } }));
}
