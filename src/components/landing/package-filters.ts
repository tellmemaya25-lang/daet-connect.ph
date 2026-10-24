import type { PackageCardData } from "@/app/(subsystems)/tours/browse/package-card";

export type Span = "all" | "hours" | "day" | "nights";

export const SPANS: { id: Span; label: string }[] = [
  { id: "all", label: "Any length" },
  { id: "hours", label: "A few hours" },
  { id: "day", label: "A full day" },
  { id: "nights", label: "Overnight or more" },
];

export function spanOf(pkg: Pick<PackageCardData, "duration_type" | "duration_value">): Exclude<Span, "all"> {
  if (pkg.duration_type === "days") return pkg.duration_value > 1 ? "nights" : "day";
  return pkg.duration_value > 5 ? "day" : "hours";
}

/** Distinct place names, most common first, so the picker only offers places that have a tour. */
export function placesOf(packages: Pick<PackageCardData, "location_name">[]): string[] {
  const counts = new Map<string, number>();
  for (const p of packages) {
    const name = p.location_name?.trim();
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name]) => name);
}

export function filterPackages(packages: PackageCardData[], span: Span, place: string | null): PackageCardData[] {
  return packages.filter((p) => (span === "all" || spanOf(p) === span) && (place === null || p.location_name?.trim() === place));
}
