/**
 * Guide schedules and swap requests (R6). The rules live in the database
 * (migration 20261108_guide_schedule_swaps.sql); this module turns their
 * error codes into plain messages and validates input before the round trip.
 */

export type BusyReason = "not_approved" | "not_available" | "already_booked";

export const BUSY_LABELS: Record<BusyReason, string> = {
  not_approved: "Not approved",
  not_available: "Not marked available that day",
  already_booked: "Already on a tour that day",
};

export const SWAP_REASON_MAX = 300;
export const SWAP_STATUS_LABELS: Record<string, string> = {
  pending: "Waiting for the operator",
  approved: "Approved",
  rejected: "Declined",
  cancelled: "Withdrawn",
};

const MESSAGES: Record<string, string> = {
  "guide_schedule:not_approved": "That guide isn't approved yet.",
  "guide_schedule:not_available": "That guide hasn't marked the tour date as available. Ask them to update their schedule first.",
  "guide_schedule:already_booked": "That guide is already on another tour that day.",
  "guide_schedule:booked_that_day": "You're on a tour that day. Suggest another guide for it before marking the day unavailable.",
  "swap:not_your_tour": "Only the guide assigned to this tour can ask for a swap.",
  "swap:tour_closed": "This tour is already past, cancelled or completed.",
  "swap:reason": `Give a short reason (3 to ${SWAP_REASON_MAX} characters).`,
  "swap:guide_not_free": "That guide isn't free on the tour date anymore. Pick another one.",
  "swap:already_pending": "There's already a swap request waiting for this tour.",
  "swap:not_found": "That request was not found or is no longer pending.",
  "swap:not_your_booking": "Only the tour's operator can decide this request.",
  "swap:already_decided": "This request was already decided.",
  "swap:choose_guide": "Choose the guide who will take over.",
  "swap:note": `Keep the note under ${SWAP_REASON_MAX} characters.`,
};

/** Plain message for a database error raised by the schedule rules, or null when it isn't one of them. */
export function scheduleErrorMessage(error: { message?: string | null } | null | undefined): string | null {
  const text = error?.message ?? "";
  const code = Object.keys(MESSAGES).find((key) => text.includes(key));
  return code ? MESSAGES[code] : null;
}

export function isBusyReason(value: unknown): value is BusyReason {
  return typeof value === "string" && value in BUSY_LABELS;
}

export function validateSwapReason(raw: unknown): { ok: true; reason: string } | { ok: false; error: string } {
  const reason = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
  if (reason.length < 3 || reason.length > SWAP_REASON_MAX) return { ok: false, error: MESSAGES["swap:reason"] };
  return { ok: true, reason };
}
