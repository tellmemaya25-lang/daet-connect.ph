"use client";

import { Button } from "@/components/ui/button";

export function PrintTicketButton() {
  return (
    <div className="mt-5 print:hidden">
      <Button variant="secondary" fullWidth onClick={() => window.print()}>
        Print ticket
      </Button>
    </div>
  );
}
