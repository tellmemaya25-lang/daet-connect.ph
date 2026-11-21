import { Suspense } from "react";
import { AdminPage } from "@/components/admin/admin-page";
import { AdminRedirect } from "@/components/admin/admin-redirect";
import { Notice } from "@/components/ui/notice";
import { PageBody } from "@/components/ui/signed-in-frame";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { timed } from "@/lib/server-timing";
import { toManilaDateKey } from "@/lib/tours/events-calendar";
import { isLlmEnabled } from "@/lib/tours/itinerary/llm";
import { addDays } from "@/lib/tours/itinerary/types";
import { getAuthenticatedSession } from "@/lib/tours/server-auth";
import { canStartBooking } from "@/lib/tours/booking-eligibility";
import { PlannerApp } from "@/app/(subsystems)/tours/plan/planner-app";
import { PlannerV2 } from "@/app/(subsystems)/tours/plan/planner-v2";

type ViewProps = { searchParams: Promise<{ describe?: string }>; inAdmin?: boolean };

/** The trip planner. `inAdmin` is for the copy inside the admin shell; elsewhere an admin is sent there. */
export function PlanView({ searchParams, inAdmin = false }: ViewProps) {
  // Works signed out as well as signed in, so the proxy does not send visitors
  // away from it; the frame around it is the signed-in one either way.
  return (
    <>
      {inAdmin ? null : (
        <Suspense fallback={null}>
          <AdminRedirect to="/tours/admin/plan" />
        </Suspense>
      )}
      <Suspense fallback={<PlannerSkeleton inAdmin={inAdmin} />}>
        <Planner searchParams={searchParams} inAdmin={inAdmin} />
      </Suspense>
    </>
  );
}

function PlannerSkeleton({ inAdmin }: { inAdmin: boolean }) {
  const Body = inAdmin ? AdminPage : PageBody;
  return (
    <Body>
      <div aria-busy="true">
        <p role="status" className="sr-only">
          Loading the trip planner
        </p>
        <div aria-hidden="true" className="animate-pulse space-y-6">
          <div className="h-10 w-2/3 max-w-md rounded-2xl bg-daet-ink/10" />
          <div className="h-5 w-1/2 max-w-sm rounded-full bg-daet-ink/10" />
          <div className="h-80 rounded-2xl bg-daet-ink/10" />
        </div>
      </div>
    </Body>
  );
}

async function Planner({ searchParams, inAdmin }: ViewProps & { inAdmin: boolean }) {
  const Body = inAdmin ? AdminPage : PageBody;
  if (!isSupabaseConfigured()) {
    return (
      <Body>
        <Notice variant="warning" title="Supabase setup needed">Configure Supabase to plan trips.</Notice>
      </Body>
    );
  }
  // The travel assistant links here with the tourist's own description of the trip.
  const { describe } = await searchParams;
  const initialDescription = typeof describe === "string" ? describe.slice(0, 500) : "";
  const session = await timed("page:plan", getAuthenticatedSession);
  const signedIn = Boolean(session.user);
  const canBook = canStartBooking(session);

  // The merged chat + plan planner. TRIP_PLANNER_V2=off brings back the old form.
  if (process.env.TRIP_PLANNER_V2 !== "off") {
    return (
      // Full width outside the admin shell: the chat is pinned to the left edge and the map fills the right.
      inAdmin ? (
        <AdminPage>
          <div className="mx-auto flex w-full max-w-[75rem] flex-wrap items-center gap-x-3 gap-y-1 px-4 pt-4 text-sm text-slate-600 dark:text-slate-400 sm:px-8">
            <span className="font-bold text-daet-ink">Admin: trip planner</span>
            <span>This is the visitor assistant, shown here so you can try it as a visitor would.</span>
          </div>
          <PlannerV2 signedIn={signedIn} canBook={canBook} initialDescription={initialDescription} />
        </AdminPage>
      ) : (
        <PageBody bleed>
          <PlannerV2 signedIn={signedIn} canBook={canBook} initialDescription={initialDescription} />
        </PageBody>
      )
    );
  }

  return (
    <Body>
      <div className="mx-auto max-w-6xl">
        <h1 className="display-2 text-daet-ink">Plan your Daet trip</h1>
        <p className="mt-2 max-w-2xl text-lg text-daet-ink">
          Tell us about your days. We build a schedule that fits opening hours, travel time and your budget.
        </p>
        <div className="mt-8">
          <PlannerApp defaultDate={addDays(toManilaDateKey(new Date()), 1)} aiAvailable={isLlmEnabled()} signedIn={signedIn} initialDescription={initialDescription} />
        </div>
      </div>
    </Body>
  );
}
