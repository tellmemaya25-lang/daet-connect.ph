"use client";

import { RecordSearch } from "@/components/shell/record-search";
import { ADMIN_SEARCH_STATUSES, ADMIN_SEARCH_TYPES } from "@/lib/tours/admin-search";

/** The admin top bar's search: it submits to the dashboard's record search (/tours/admin?q=…). */
export function AdminSearch() {
  return <RecordSearch action="/tours/admin" types={ADMIN_SEARCH_TYPES} statuses={ADMIN_SEARCH_STATUSES} />;
}
