import type { Metadata } from "next";
import { AssistantChat } from "@/components/assistant/assistant-chat";
import { PageFrame } from "@/components/ui/page-frame";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getAuthenticatedSession } from "@/lib/tours/server-auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Help", description: "Ask the 24/7 Daet travel assistant about tours, open dates, payments, cancellations and your bookings." };

export default async function HelpPage() {
  let signedIn = false;
  if (isSupabaseConfigured()) {
    try {
      signedIn = Boolean((await getAuthenticatedSession()).user);
    } catch {
      signedIn = false;
    }
  }
  return (
    <PageFrame>
      <div className="mx-auto max-w-2xl">
        <p className="text-xs font-black text-daet-leaf">Help · 24/7</p>
        <h1 className="mt-1 text-3xl font-black text-daet-ink">Daet travel assistant</h1>
        <p className="mt-2 text-sm leading-6 text-daet-ink/70">
          Ask about tours, open dates and prices, places and events, how to pay or cancel, or your own bookings. The assistant only reads; you make bookings and payments yourself. For anything it can&apos;t answer, it passes you to the operator or the Daet Tourism Office.
        </p>
        <div className="mt-6 flex h-[70dvh] min-h-[28rem] flex-col overflow-hidden rounded-2xl bg-white">
          <AssistantChat signedIn={signedIn} />
        </div>
      </div>
    </PageFrame>
  );
}
