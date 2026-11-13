"use client";

import { Button } from "@/components/ui/button";

/** Opens the browser's print dialog; "Save as PDF" there gives the PDF. */
export function PrintPageButton({ label = "Print / Save as PDF" }: { label?: string }) {
  return (
    <Button variant="primary" onClick={() => window.print()} className="print:hidden">
      {label}
    </Button>
  );
}
