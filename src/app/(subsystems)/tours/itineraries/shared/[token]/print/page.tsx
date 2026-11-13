import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { PageFrame } from "@/components/ui/page-frame";
import { ItineraryPrintSheet } from "@/components/tours/itinerary-print-sheet";
import { PrintPageButton } from "@/components/tours/print-page-button";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { rowsToDays, type SavedItem } from "@/lib/tours/itinerary/form";
import { isUuid } from "@/lib/tours/operator-access";
import { appBaseUrl } from "@/lib/tours/qr-issue";

export const metadata: Metadata = { title: "Print shared itinerary", robots: { index: false } };

type Shared = { title: string; start_date: string | null; summary: string | null; items: SavedItem[] };

export default async function PrintSharedItineraryPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isSupabaseConfigured() || !isUuid(token)) notFound();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("tours_shared_itinerary", { p_token: token });
  const shared = data as Shared | null;
  if (!shared) notFound();
  const days = rowsToDays(shared.items ?? [], shared.start_date);

  return (
    <PageFrame>
      <div className="mx-auto mb-4 flex max-w-3xl flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/tours/itineraries/shared/${token}`} className="inline-flex min-h-11 items-center gap-1 text-sm font-bold text-blue-700 hover:underline dark:text-blue-300">
          <span aria-hidden="true">←</span> Back to the plan
        </Link>
        <PrintPageButton />
      </div>
      <ItineraryPrintSheet title={shared.title} subtitle="Shared trip plan" summary={shared.summary} days={days} link={`${appBaseUrl()}/tours/itineraries/shared/${token}`} />
    </PageFrame>
  );
}
