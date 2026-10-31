"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";

export type CsvImportState = { message: string | null; errors: Array<{ line: number; message: string }> };

/** A CSV upload for an admin directory: shows the row errors, or how many rows were imported. */
export function CsvImportForm({
  action,
  columns,
  required,
  template,
  templateName,
}: {
  action: (prev: CsvImportState, formData: FormData) => Promise<CsvImportState>;
  columns: readonly string[];
  required: string;
  template: string;
  templateName: string;
}) {
  const [state, formAction, pending] = useActionState(action, { message: null, errors: [] });

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
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Columns: <code>{columns.join(", ")}</code>. Required: {required}.
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="file"
          name="file"
          accept=".csv,text/csv"
          required
          aria-label="CSV file"
          className="block w-full text-sm text-daet-ink file:mr-3 file:min-h-11 file:rounded-full file:border-0 file:bg-blue-50 dark:file:bg-blue-950/40 file:px-4 file:text-sm file:font-bold file:text-blue-700 dark:file:text-blue-300"
        />
        <Button type="submit" loading={pending} loadingText="Importing…" className="shrink-0">
          Import CSV
        </Button>
      </div>
      <a href={`data:text/csv;charset=utf-8,${encodeURIComponent(template)}`} download={templateName} className="inline-flex min-h-11 items-center font-bold text-blue-700 dark:text-blue-300 underline">
        Download a template
      </a>
    </form>
  );
}
