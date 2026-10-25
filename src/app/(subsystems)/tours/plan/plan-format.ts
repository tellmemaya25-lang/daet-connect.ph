export const longDate = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });

export const shortDate = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

export const peso = (n: number) => `₱${n.toLocaleString("en-PH", { maximumFractionDigits: 2 })}`;

/** Swaps the item at `index` with its neighbour `by` places away; out-of-range moves change nothing. */
export function move(ids: string[], index: number, by: number): string[] {
  const next = [...ids];
  const target = index + by;
  if (index < 0 || target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
