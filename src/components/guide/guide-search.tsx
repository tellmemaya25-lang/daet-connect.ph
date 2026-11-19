"use client";

import { RecordSearch } from "@/components/shell/record-search";
import { GUIDE_SEARCH_STATUSES, GUIDE_SEARCH_TYPES } from "@/lib/tours/guide-search";

/** The guide top bar's search: it submits to the guide's record search (/tours/guide/search?q=…). */
export function GuideSearch() {
  return <RecordSearch action="/tours/guide/search" types={GUIDE_SEARCH_TYPES} statuses={GUIDE_SEARCH_STATUSES} />;
}
