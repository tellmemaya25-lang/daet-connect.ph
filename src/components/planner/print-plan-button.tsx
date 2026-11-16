"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { LineIcon } from "@/components/ui/icons";
import { ItineraryPrintSheet } from "@/components/tours/itinerary-print-sheet";
import type { ItineraryResult } from "@/lib/tours/assistant/plan-tool";
import type { SavedDay } from "@/lib/tours/itinerary/form";

/** The plan on screen → the print sheet's days, with each stop's tip and place. */
export function planToPrintDays(itinerary: Pick<ItineraryResult, "plan" | "stops">): SavedDay[] {
  const byId = new Map(itinerary.stops.map((s) => [s.id, s]));
  return itinerary.plan.days.map((day, i) => ({
    dayNumber: i + 1,
    date: day.date,
    items: day.blocks.map((block) => {
      const stop = block.kind === "visit" ? byId.get(block.attractionId) : undefined;
      return {
        kind: block.kind,
        name: block.name,
        start: block.start,
        end: block.end,
        travelMinutes: block.travelMinutes,
        tip: stop?.tip ?? null,
        lat: stop?.lat ?? null,
        lng: stop?.lng ?? null,
        slug: null,
      };
    }),
  }));
}

/**
 * Prints the plan being drafted (it has no page of its own until it is saved):
 * the same paper sheet as a saved trip, put on the page only while printing.
 * "Save as PDF" in the print dialog gives the PDF.
 */
export function PrintPlanButton({ itinerary, title, subtitle }: { itinerary: ItineraryResult; title: string; subtitle: string }) {
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    if (!printing) return;
    const done = () => setPrinting(false);
    window.addEventListener("afterprint", done);
    // Let the sheet render before the dialog opens.
    const timer = window.setTimeout(() => window.print(), 50);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("afterprint", done);
    };
  }, [printing]);

  const fees = new Map(itinerary.stops.map((s) => [s.name, s.fee]));

  return (
    <>
      <Button variant="secondary" onClick={() => setPrinting(true)}>
        <LineIcon name="note" className="h-4 w-4" /> Print / PDF
      </Button>
      {printing
        ? createPortal(
            <div data-print-plan="" className="hidden print:block">
              <ItineraryPrintSheet title={title} subtitle={subtitle} summary={null} days={planToPrintDays(itinerary)} fees={fees} link={null} />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
