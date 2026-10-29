/**
 * Money shown to people (R3): pesos with thousands separators and always two
 * decimals, e.g. ₱1,850.00. Supabase returns numeric columns as numbers or
 * strings, so both are accepted; anything unreadable shows as ₱0.00.
 */
const PESO = new Intl.NumberFormat("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatPeso(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  return `₱${PESO.format(Number.isFinite(n) ? n : 0)}`;
}

/** Plain two-decimal amount for CSV cells and form defaults (no symbol, no separators). */
export function pesoAmount(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  return (Number.isFinite(n) ? n : 0).toFixed(2);
}
