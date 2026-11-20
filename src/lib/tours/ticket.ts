/**
 * A booking gets its ticket QR once the operator has confirmed it and it is
 * paid in full. Completed tours keep theirs as a record. Check-in follows the
 * same rule (checkInAllowed and the tours_check_in database function).
 */
export function hasTicket(booking: { status: string; payment_status: string | null }): boolean {
  return (booking.status === "confirmed" || booking.status === "completed") && booking.payment_status === "paid";
}

/**
 * Whether to offer the ticket QR: a confirmed, paid booking up to the end of
 * its tour day (Manila), when `ticketExpiry` makes the signed token stop
 * verifying. Bookings stay "confirmed" after the tour until the operator
 * completes them, so `hasTicket` alone would keep offering an expired QR.
 * `today` is the Manila date key (`toManilaDateKey(new Date())`).
 */
export function hasUsableTicket(
  booking: { status: string; payment_status: string | null; tour_date: string },
  today: string,
): boolean {
  return booking.status === "confirmed" && hasTicket(booking) && booking.tour_date >= today;
}
