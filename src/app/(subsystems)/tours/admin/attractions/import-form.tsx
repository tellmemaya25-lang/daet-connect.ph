"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { CSV_COLUMNS, CSV_MAX_ROWS } from "@/lib/tours/attractions";
import { importAttractionsCsv, type ImportState } from "./actions";

const initialState: ImportState = { message: null, errors: [] };
const TEMPLATE = `${CSV_COLUMNS.join(",")}\nBagasbas Beach,beach,Daet,Barangay Bagasbas,14.1316,122.9851,Daily 06:00-18:00,,180,0,"Surfing beach",Daet MTO 2026,\n`;

export function ImportAttractionsForm() {
  const [state, formAction, pending] = useActionState(importAttractionsCsv, initialState);

  return (
    <form action={formAction} className="space-y-3">
      {state.message ? <Notice variant={state.errors.length ? "error" : "success"}>{state.message}</Notice> : null}
      {state.errors.length ? (
        <ul className="max-h-48 list-disc overflow-y-auto rounded-2xl bg-red-50 dark:bg-red-950/40 p-3 pl-7 text-sm text-red-900 dark:text-red-300">
          {state.errors.map((error) => (
            <li key={`${error.line}-${error.message}`}>
              Line {error.line}: {error.message}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="text-sm text-daet-ink/70">
        Columns: <code className="text-xs">{CSV_COLUMNS.join(", ")}</code>. Only name, category and source are required; up to {CSV_MAX_ROWS} rows. Existing slugs are skipped.
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="file"
          name="file"
          accept=".csv,text/csv"
          required
          aria-label="CSV file"
          className="block w-full text-sm text-daet-ink file:mr-3 file:min-h-11 file:rounded-full file:border-0 file:bg-daet-sand file:px-4 file:text-sm file:font-bold file:text-daet-ink"
        />
        <Button type="submit" loading={pending} loadingText="Importing…" className="shrink-0">
          Import CSV
        </Button>
      </div>
      <a href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`} download="attractions-template.csv" className="inline-flex min-h-11 items-center text-sm font-bold text-daet-forest dark:text-blue-300 underline">
        Download a template
      </a>
    </form>
  );
}
