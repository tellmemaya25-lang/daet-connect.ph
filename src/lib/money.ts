/**
 * Money shown to people (R3): pesos with thousands separators and always two
 * decimals, e.g. ₱1,850.00. Supabase returns numeric columns as numbers or
 * strings, so both are accepted; anything unreadable shows as ₱0.00. Negatives
 * put the sign first: -₱932.00.
 */
const PESO = new Intl.NumberFormat("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatPeso(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  const amount = Number.isFinite(n) ? n : 0;
  // Sign before the symbol (-₱932.00, not ₱-932.00); -0 and tiny negatives that round to zero show as ₱0.00.
  const sign = amount < 0 && PESO.format(Math.abs(amount)) !== PESO.format(0) ? "-" : "";
  return `${sign}₱${PESO.format(Math.abs(amount))}`;
}

/** Plain two-decimal amount for CSV cells and form defaults (no symbol, no separators). */
export function pesoAmount(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  return (Number.isFinite(n) ? n : 0).toFixed(2);
}
