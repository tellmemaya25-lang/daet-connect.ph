/**
 * The twelve municipalities of Camarines Norte. Packages are placed in one and
 * guides serve one or more (owner's list, item 9). Keep in step with
 * tours_municipalities() in 20261203_pickup_earnings_accounts_guide_areas.sql.
 */
export const MUNICIPALITIES = [
  "Basud",
  "Capalonga",
  "Daet",
  "Jose Panganiban",
  "Labo",
  "Mercedes",
  "Paracale",
  "San Lorenzo Ruiz",
  "San Vicente",
  "Santa Elena",
  "Talisay",
  "Vinzons",
] as const;

export type Municipality = (typeof MUNICIPALITIES)[number];

export function isMunicipality(value: unknown): value is Municipality {
  return typeof value === "string" && (MUNICIPALITIES as readonly string[]).includes(value);
}

/** Parses a peso amount typed by a person: digits with up to two decimals, or blank for none. */
export function parsePesoInput(raw: string, max = 100_000): { ok: true; value: number | null } | { ok: false } {
  const text = raw.trim().replace(/,/g, "");
  if (text === "") return { ok: true, value: null };
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return { ok: false };
  const value = Number(text);
  return value > max ? { ok: false } : { ok: true, value };
}
