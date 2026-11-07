/**
 * Small, shared helpers for a package draft.
 *
 * The create wizard and the editor both work on `EditPackageFormData`, and both
 * describe it the same way, so the wording lives here once: a section id, how a
 * duration reads, and what still has to be filled in before a package can be
 * submitted.
 */

import type { EditPackageFormData } from "../[id]/edit/edit-types";

/** The five parts of a package, in the order operators think about them. */
export type PackageSectionId = "basics" | "photos" | "prices" | "included" | "stops";

export const PACKAGE_SECTION_LABELS: Record<PackageSectionId, string> = {
  basics: "Basics",
  photos: "Photos",
  prices: "Prices",
  included: "What's included",
  stops: "Route & stops",
};

/** "3 days", "1 day", "2.5 days", "4 hours" — never nights, which we don't know. */
export function formatDuration(value: number, type: "hours" | "days"): string {
  const unit = value === 1 ? type.slice(0, -1) : type;
  return `${value} ${unit}`;
}

export interface PackageChecklistItem {
  id: string;
  label: string;
  done: boolean;
  section: PackageSectionId;
}

/**
 * What is still missing before the Tourism Office can review a package.
 * Mirrors the database guard in `submit_package_for_review`, plus the cover
 * photo operators are asked for.
 */
export function draftChecklist(draft: EditPackageFormData): PackageChecklistItem[] {
  return [
    {
      id: "cover",
      label: "Add a cover photo",
      done: Boolean(draft.coverImageUrl),
      section: "photos",
    },
    {
      id: "price",
      label: "Add at least one price option",
      done: draft.priceVariants.length > 0,
      section: "prices",
    },
    {
      id: "inclusions",
      label: "Say what's included",
      done: draft.inclusions.some((item) => item.isIncluded),
      section: "included",
    },
    {
      id: "stops",
      label: "Add at least one stop",
      done: draft.stops.length > 0,
      section: "stops",
    },
  ];
}

export function missingChecklistItems(draft: EditPackageFormData): PackageChecklistItem[] {
  return draftChecklist(draft).filter((item) => !item.done);
}
