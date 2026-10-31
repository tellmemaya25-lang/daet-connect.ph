/**
 * A booking gets its ticket QR once the operator has confirmed it and it is
 * paid in full. Completed tours keep theirs as a record. Check-in follows the
 * same rule (checkInAllowed and the tours_check_in database function).
 */
export function hasTicket(booking: { status: string; payment_status: string | null }): boolean {
  return (booking.status === "confirmed" || booking.status === "completed") && booking.payment_status === "paid";
}
