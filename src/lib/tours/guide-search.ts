/** What the guide's top-bar search can look for, and the statuses it can narrow by. */
export const GUIDE_SEARCH_TYPES = [
  { value: "all", label: "All records" },
  { value: "tours", label: "My tours" },
  { value: "operators", label: "Operators" },
] as const;

export type GuideSearchType = (typeof GUIDE_SEARCH_TYPES)[number]["value"];

export const GUIDE_SEARCH_STATUSES = [
  { value: "all", label: "Any status" },
  { value: "confirmed", label: "Confirmed" },
  { value: "completed", label: "Completed" },
  { value: "active", label: "Working with them" },
  { value: "pending", label: "Application pending" },
  { value: "ended", label: "Ended" },
] as const;

export type GuideSearchStatus = (typeof GUIDE_SEARCH_STATUSES)[number]["value"];

export function parseGuideSearchType(raw: unknown): GuideSearchType {
  return GUIDE_SEARCH_TYPES.some((item) => item.value === raw) ? (raw as GuideSearchType) : "all";
}

export function parseGuideSearchStatus(raw: unknown): GuideSearchStatus {
  return GUIDE_SEARCH_STATUSES.some((item) => item.value === raw) ? (raw as GuideSearchStatus) : "all";
}

/** Which statuses make sense for each record type. A status a type cannot have returns nothing for it. */
export const GUIDE_SEARCH_SUPPORTED: Record<Exclude<GuideSearchType, "all">, readonly GuideSearchStatus[]> = {
  tours: ["confirmed", "completed"],
  operators: ["active", "pending", "ended"],
};
