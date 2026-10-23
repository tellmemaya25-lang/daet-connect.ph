import type { Metadata } from "next";
import { Notice } from "@/components/ui/notice";
import { PageFrame } from "@/components/ui/page-frame";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toManilaDateKey } from "@/lib/tours/events-calendar";
import { isLlmEnabled } from "@/lib/tours/itinerary/llm";
import { addDays } from "@/lib/tours/itinerary/types";
import { PlannerApp } from "./planner-app";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Plan your trip", description: "Build a day-by-day Daet itinerary that fits opening hours and your budget." };

export default async function PlanPage() {
  if (!isSupabaseConfigured()) {
    return (
      <PageFrame>
        <Notice variant="warning" title="Supabase setup needed">Configure Supabase to plan trips.</Notice>
      </PageFrame>
    );
  }
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <PageFrame>
      <div className="mx-auto max-w-3xl">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-daet-leaf">Trip planner</p>
        <h1 className="mt-1 text-4xl font-black text-daet-ink">Plan your Daet trip</h1>
        <p className="mt-2 text-sm leading-6 text-daet-ink/70">
          Tell us your dates and interests. We build each day from our attraction list so every stop is open when you arrive, travel time is included, and entrance fees stay within your budget.
        </p>
        <div className="mt-8 rounded-3xl border border-daet-ink/10 bg-white p-5 shadow-sm sm:p-8">
          <PlannerApp defaultDate={addDays(toManilaDateKey(new Date()), 1)} aiAvailable={isLlmEnabled()} signedIn={Boolean(user)} />
        </div>
      </div>
    </PageFrame>
  );
}
