/**
 * Booking lifecycle — single source of truth for allowed status changes.
 * The database enforces the same rules in tours_bookings_status_guard().
 *
 *   pending ──confirm──▶ confirmed ──complete──▶ completed
 *      │  └──reject──▶ rejected        │
 *      └──cancel──▶ cancelled ◀──cancel─┘
 *
 * Tourists never change status directly: an unpaid pending booking can be
 * cancelled instantly; anything else becomes a cancellation request that the
 * operator approves (see cancellation.ts).
 */

export const BOOKING_STATUSES = ["pending", "confirmed", "completed", "cancelled", "rejected"] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export type BookingActor = "operator" | "admin" | "tourist";

export const TERMINAL_STATUSES: readonly BookingStatus[] = ["completed", "cancelled", "rejected"];

export function isBookingStatus(value: unknown): value is BookingStatus {
  return typeof value === "string" && (BOOKING_STATUSES as readonly string[]).includes(value);
}

export const STATUS_LABELS: Record<BookingStatus, string> = {
  pending: "Pending confirmation",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
  rejected: "Declined",
};

type TransitionContext = {
  /** Tour date (YYYY-MM-DD, Manila). */
  tourDate: string;
  /** Today in Manila (YYYY-MM-DD). */
  today: string;
  totalPaid: number;
};

export type TransitionCheck = { ok: true } | { ok: false; reason: string };

export function checkTransition(
  from: BookingStatus,
  to: BookingStatus,
  actor: BookingActor,
  context: TransitionContext,
): TransitionCheck {
  if (from === to) return { ok: true };
  if (TERMINAL_STATUSES.includes(from)) {
    return { ok: false, reason: `This booking is already ${STATUS_LABELS[from].toLowerCase()}.` };
  }

  const staff = actor === "operator" || actor === "admin";

  if (from === "pending") {
    if (to === "confirmed" || to === "rejected") {
      return staff ? { ok: true } : { ok: false, reason: "Only the operator can confirm or decline a booking." };
    }
    if (to === "cancelled") {
      if (staff) return { ok: true };
      return context.totalPaid > 0
        ? { ok: false, reason: "This booking has a payment. Request a cancellation so the operator can arrange a refund." }
        : { ok: true };
    }
  }

  if (from === "confirmed") {
    if (to === "completed") {
      if (!staff) return { ok: false, reason: "Only the operator can mark a tour as completed." };
      return context.tourDate <= context.today
        ? { ok: true }
        : { ok: false, reason: "A tour can be marked completed on or after the tour date." };
    }
    if (to === "cancelled") {
      return staff ? { ok: true } : { ok: false, reason: "Request a cancellation; the operator will review it." };
    }
  }

  return { ok: false, reason: `A ${STATUS_LABELS[from].toLowerCase()} booking cannot become ${STATUS_LABELS[to].toLowerCase()}.` };
}

export type OperatorAction = {
  to: BookingStatus;
  label: string;
  variant: "primary" | "secondary" | "danger";
  confirm: string;
  needsReason?: boolean;
};

/** Buttons the operator sees for a booking, derived from the transition rules. */
export function operatorActions(status: BookingStatus, context: TransitionContext): OperatorAction[] {
  const candidates: OperatorAction[] = [
    { to: "confirmed", label: "Confirm booking", variant: "primary", confirm: "Confirm this booking? The tourist can then pay." },
    { to: "rejected", label: "Decline", variant: "danger", confirm: "Decline this booking? Its seats are released.", needsReason: true },
    { to: "completed", label: "Mark as completed", variant: "primary", confirm: "Mark this tour as completed?" },
    { to: "cancelled", label: "Cancel booking", variant: "danger", confirm: "Cancel this confirmed booking? Its seats are released. Record any refund afterwards.", needsReason: true },
  ];
  return candidates.filter((action) => checkTransition(status, action.to, "operator", context).ok && action.to !== status);
}
