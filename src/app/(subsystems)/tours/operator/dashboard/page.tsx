import { redirect } from "next/navigation";
import { Notice } from "@/components/ui/notice";
import { PageFrame } from "@/components/ui/page-frame";
import { canAccessOperatorDashboard } from "@/lib/tours/operator-access";
import { OPERATOR_OWN_STATUS_SELECT, OPERATOR_TABLE, OPERATOR_USER_ID_COLUMN } from "@/lib/tours/operator-contract";
import { getAuthenticatedSession } from "@/lib/tours/server-auth";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function OperatorDashboardPage() {
  if (!isSupabaseConfigured()) {
    return <PageFrame><Notice variant="warning" title="Supabase setup is needed">Configure Supabase before opening the operator dashboard.</Notice></PageFrame>;
  }

  let session;
  try {
    session = await getAuthenticatedSession();
  } catch {
    session = { user: null, role: null, error: "Supabase could not be reached." };
  }

  if (!session.user) redirect(`/login?next=${encodeURIComponent("/tours/operator/dashboard")}`);
  if (session.role === "admin") redirect("/tours/admin/operators");
  if (session.error || !session.role) {
    return <PageFrame><Notice variant="error" title="We could not verify your account">{session.error ?? "Your role could not be verified."}</Notice></PageFrame>;
  }

  const supabase = await createSupabaseServerClient();
  
  // Debug logging
  console.log("🔍 Dashboard Debug:");
  console.log("  User ID:", session.user.id);
  console.log("  OPERATOR_TABLE:", OPERATOR_TABLE);
  console.log("  OPERATOR_USER_ID_COLUMN:", OPERATOR_USER_ID_COLUMN);
  console.log("  OPERATOR_OWN_STATUS_SELECT:", OPERATOR_OWN_STATUS_SELECT);
  
  const { data: application, error } = await supabase
    .from(OPERATOR_TABLE)
    .select(OPERATOR_OWN_STATUS_SELECT)
    .eq(OPERATOR_USER_ID_COLUMN, session.user.id)
    .maybeSingle();

  console.log("  Query result:", application);
  console.log("  Query error:", error);

  if (error) {
    console.error("❌ Dashboard query error:", error);
    return <PageFrame><Notice variant="error" title="Accreditation could not be checked">Access is paused until your accreditation status can be verified.</Notice></PageFrame>;
  }
  if (!application) redirect("/tours/operator/register");
  if (application.accreditation_status !== "approved") {
    if (application.accreditation_status === "rejected") redirect("/tours/operator/register");
    redirect("/tours/operator/pending");
  }
  if (!canAccessOperatorDashboard(session.role, application.accreditation_status)) {
    return <PageFrame><Notice variant="error" title="Operator access is not enabled">Your accreditation is approved, but the account role does not match. Contact the Tourism Office administrator.</Notice></PageFrame>;
  }

  // Fetch booking stats
  const { data: bookings } = await supabase
    .from("tours_bookings")
    .select(
      `
      id,
      status,
      tours_packages!inner (
        operator_id
      )
    `
    )
    .eq("tours_packages.operator_id", application.id);

  const bookingStats = {
    total: bookings?.length || 0,
    pending: bookings?.filter((b) => b.status === "pending").length || 0,
    confirmed: bookings?.filter((b) => b.status === "confirmed").length || 0,
  };

  return (
    <PageFrame>
      <section className="rounded-3xl border border-daet-ink/10 bg-white p-6 shadow-card sm:p-10">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-daet-leaf">Accredited operator</p>
        <h1 className="mt-2 text-3xl font-black text-daet-ink">Welcome to your operator dashboard.</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-daet-ink/65">Your accreditation is approved. Manage your tour packages and bookings below.</p>
        
        {/* Booking Stats */}
        {bookingStats.total > 0 && (
          <div className="mt-6 grid grid-cols-3 gap-4">
            <div className="rounded-2xl border border-daet-ink/10 bg-daet-sand/30 p-4 text-center">
              <p className="text-3xl font-black text-daet-ink">{bookingStats.total}</p>
              <p className="text-xs text-daet-ink/60">Total Bookings</p>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-center">
              <p className="text-3xl font-black text-amber-900">{bookingStats.pending}</p>
              <p className="text-xs text-amber-900/60">Pending</p>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-center">
              <p className="text-3xl font-black text-emerald-900">{bookingStats.confirmed}</p>
              <p className="text-xs text-emerald-900/60">Confirmed</p>
            </div>
          </div>
        )}

        <div className="mt-7 flex flex-wrap gap-3">
          <div className="inline-flex min-h-10 items-center rounded-full bg-emerald-50 px-4 text-sm font-bold text-emerald-800">
            Accreditation approved
          </div>
          <a
            href="/tours/operator/packages"
            className="inline-flex min-h-10 items-center rounded-full bg-daet-forest px-5 text-sm font-bold text-white transition hover:bg-daet-ink"
          >
            Manage packages →
          </a>
          <a
            href="/tours/operator/bookings"
            className="inline-flex min-h-10 items-center rounded-full border border-daet-forest/20 px-5 text-sm font-bold text-daet-forest transition hover:bg-daet-forest/5"
          >
            Manage bookings →
          </a>
          <a
            href="/tours/operator/settings"
            className="inline-flex min-h-10 items-center rounded-full border border-daet-forest/20 px-5 text-sm font-bold text-daet-forest transition hover:bg-daet-forest/5"
          >
            ⚙️ Payment Settings →
          </a>
        </div>
      </section>
    </PageFrame>
  );
}
