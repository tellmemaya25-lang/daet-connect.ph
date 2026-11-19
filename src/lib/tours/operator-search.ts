/** What the operator's top-bar search can look for, and the statuses it can narrow by. */
export const OPERATOR_SEARCH_TYPES = [
  { value: "all", label: "All records" },
  { value: "bookings", label: "Bookings" },
  { value: "packages", label: "Tour packages" },
  { value: "guides", label: "Guides on your team" },
  { value: "merchandise", label: "Merchandise" },
  { value: "reviews", label: "Reviews" },
] as const;

export type OperatorSearchType = (typeof OPERATOR_SEARCH_TYPES)[number]["value"];

export const OPERATOR_SEARCH_STATUSES = [
  { value: "all", label: "Any status" },
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "rejected", label: "Rejected / not approved" },
  { value: "published", label: "Published" },
  { value: "draft", label: "Draft" },
  { value: "archived", label: "Archived" },
  { value: "approved", label: "Approved" },
  { value: "active", label: "Active on your team" },
  { value: "ended", label: "Ended" },
  { value: "visible", label: "Visible review" },
  { value: "hidden", label: "Hidden review" },
] as const;

export type OperatorSearchStatus = (typeof OPERATOR_SEARCH_STATUSES)[number]["value"];

export function parseOperatorSearchType(raw: unknown): OperatorSearchType {
  return OPERATOR_SEARCH_TYPES.some((item) => item.value === raw) ? (raw as OperatorSearchType) : "all";
}

export function parseOperatorSearchStatus(raw: unknown): OperatorSearchStatus {
  return OPERATOR_SEARCH_STATUSES.some((item) => item.value === raw) ? (raw as OperatorSearchStatus) : "all";
}

/** Which statuses make sense for each record type. A status a type cannot have returns nothing for it. */
export const OPERATOR_SEARCH_SUPPORTED: Record<Exclude<OperatorSearchType, "all">, readonly OperatorSearchStatus[]> = {
  bookings: ["pending", "confirmed", "completed", "cancelled", "rejected"],
  packages: ["pending", "published", "draft", "archived"],
  guides: ["active", "ended"],
  merchandise: ["pending", "approved", "rejected"],
  reviews: ["hidden", "visible"],
};
