/**
 * Pickup points an operator lists on a package, each with its own fee
 * (owner's list, item 5). The database adds the fee to the booking total;
 * these helpers show the same number before the tourist books, and check the
 * operator's list before it is saved.
 */
export type PickupPoint = { id: string; name: string; fee: number; feePer: "booking" | "person"; note: string | null };

export const MAX_PICKUP_POINTS = 20;
export const MAX_PICKUP_FEE = 100_000;

/** What a pickup point adds to the booking, for this many guests. */
export function pickupFee(point: Pick<PickupPoint, "fee" | "feePer"> | null | undefined, pax: number): number {
  if (!point) return 0;
  return point.feePer === "person" ? point.fee * Math.max(pax, 0) : point.fee;
}

/** "Free", "₱150 per person", "₱300 per booking" — wording only, no currency formatting. */
export function pickupFeeLabel(point: Pick<PickupPoint, "fee" | "feePer">, peso: (n: number) => string): string {
  if (point.fee <= 0) return "Free";
  return `${peso(point.fee)} ${point.feePer === "person" ? "per person" : "per booking"}`;
}

type PickupRow = { id: string; name: string; fee: number | string; fee_per: string; note: string | null; is_active?: boolean | null };

/** Database rows → points, active ones only, in the operator's order. */
export function toPickupPoints(rows: PickupRow[] | null | undefined): PickupPoint[] {
  return (rows ?? [])
    .filter((row) => row.is_active !== false)
    .map((row) => ({ id: row.id, name: row.name, fee: Number(row.fee) || 0, feePer: row.fee_per === "person" ? "person" : "booking", note: row.note }));
}

export type PickupDraft = { name: string; fee: string; feePer: "booking" | "person"; note: string };

/** Checks the operator's list; returns the payload for tours_set_pickup_points or a message. */
export function validatePickupDrafts(drafts: PickupDraft[]): { ok: true; points: Array<{ name: string; fee: number; fee_per: string; note: string | null }> } | { ok: false; error: string } {
  const filled = drafts.filter((d) => d.name.trim() || d.fee.trim());
  if (filled.length > MAX_PICKUP_POINTS) return { ok: false, error: `List up to ${MAX_PICKUP_POINTS} pickup points.` };
  const seen = new Set<string>();
  const points = [];
  for (const draft of filled) {
    const name = draft.name.trim().replace(/\s+/g, " ");
    if (name.length < 2 || name.length > 120) return { ok: false, error: "Each pickup point needs a name of 2 to 120 characters." };
    const key = name.toLowerCase();
    if (seen.has(key)) return { ok: false, error: `"${name}" is listed twice.` };
    seen.add(key);
    const feeText = draft.fee.trim() === "" ? "0" : draft.fee.trim();
    if (!/^\d+(\.\d{1,2})?$/.test(feeText)) return { ok: false, error: `Enter the fee for "${name}" in pesos, e.g. 150.` };
    const fee = Number(feeText);
    if (fee > MAX_PICKUP_FEE) return { ok: false, error: `The fee for "${name}" is too high.` };
    const note = draft.note.trim();
    if (note.length > 300) return { ok: false, error: `Keep the note for "${name}" under 300 characters.` };
    points.push({ name, fee, fee_per: draft.feePer, note: note || null });
  }
  return { ok: true, points };
}
