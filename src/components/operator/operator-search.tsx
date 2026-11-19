"use client";

import { RecordSearch } from "@/components/shell/record-search";
import { OPERATOR_SEARCH_STATUSES, OPERATOR_SEARCH_TYPES } from "@/lib/tours/operator-search";

/** The operator top bar's search: it submits to the operator's record search (/tours/operator/search?q=…). */
export function OperatorSearch() {
  return <RecordSearch action="/tours/operator/search" types={OPERATOR_SEARCH_TYPES} statuses={OPERATOR_SEARCH_STATUSES} />;
}
