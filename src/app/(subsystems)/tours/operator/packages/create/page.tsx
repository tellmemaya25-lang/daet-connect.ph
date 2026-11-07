import { redirect } from "next/navigation";
import { PageFrame } from "@/components/ui/page-frame";
import { Notice } from "@/components/ui/notice";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getAuthenticatedSession } from "@/lib/tours/server-auth";
import { canAccessOperatorDashboard } from "@/lib/tours/operator-access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  OPERATOR_TABLE,
  OPERATOR_USER_ID_COLUMN,
  OPERATOR_OWN_STATUS_SELECT,
} from "@/lib/tours/operator-contract";
import { PackageCreateWizard } from "./package-create-wizard";


export default async function CreatePackagePage() {
  if (!isSupabaseConfigured()) {
    return (
      <PageFrame>
        <Notice variant="warning" title="Supabase setup needed">
          Configure Supabase before creating packages.
        </Notice>
      </PageFrame>
    );
  }

  let session;
  try {
    session = await getAuthenticatedSession();
  } catch {
    session = { user: null, role: null, error: "Supabase could not be reached." };
  }

  if (!session.user) {
    redirect(`/login?next=${encodeURIComponent("/tours/operator/packages/create")}`);
  }

  if (session.error || !session.role) {
    return (
      <PageFrame>
        <Notice variant="error" title="Account verification failed">
          {session.error ?? "Your role could not be verified."}
        </Notice>
      </PageFrame>
    );
  }

  const supabase = await createSupabaseServerClient();
  
  // Get operator info - using profile_id (correct column name)
  const { data: operator, error } = await supabase
    .from("tours_operators")
    .select("id, accreditation_status, business_name")
    .eq("profile_id", session.user.id)
    .maybeSingle();

  if (error || !operator) {
    return (
      <PageFrame>
        <Notice variant="error" title="Could not verify accreditation">
          Your operator status could not be checked.
        </Notice>
      </PageFrame>
    );
  }

  if (operator.accreditation_status !== "approved") {
    redirect("/tours/operator/pending");
  }

  if (!canAccessOperatorDashboard(session.role, operator.accreditation_status)) {
    return (
      <PageFrame>
        <Notice variant="error" title="Access denied">
          Your accreditation and account role do not match.
        </Notice>
      </PageFrame>
    );
  }

  const { data: attractions, error: attractionsError } = await supabase
    .from("tours_attractions")
    .select("id, name, description, latitude, longitude")
    .eq("is_active", true)
    .order("name");

  return (
    <PageFrame>
      <div className="mx-auto max-w-4xl">
        <div className="mb-6">
          <h1 className="display-2 text-daet-ink">New tour package</h1>
          <p className="mt-2 text-sm leading-6 text-daet-ink/65">
            Five short steps. Your draft is saved after each one, so you can stop and finish later.
            When you submit it, the Tourism Office reviews the package before tourists see it.
          </p>
        </div>

        {attractionsError ? (
          <div className="mb-5">
            <Notice variant="warning" title="Attractions unavailable">
              The list of places could not be loaded. You can still pick each stop on the map.
            </Notice>
          </div>
        ) : null}

        <PackageCreateWizard
          operatorName={operator.business_name ?? undefined}
          attractions={attractions ?? []}
        />
      </div>
    </PageFrame>
  );
}
