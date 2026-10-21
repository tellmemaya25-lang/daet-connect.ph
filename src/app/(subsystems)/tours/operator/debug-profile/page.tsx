import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageFrame } from "@/components/ui/page-frame";
import { getAuthenticatedSession } from "@/lib/tours/server-auth";

export const dynamic = "force-dynamic";

export default async function DebugProfilePage() {
  const session = await getAuthenticatedSession();
  const supabase = await createSupabaseServerClient();

  // Try both column names
  const { data: operatorByProfileId } = await supabase
    .from("tours_operators")
    .select("*")
    .eq("profile_id", session.user?.id || "")
    .maybeSingle();

  const { data: operatorByUserId } = await supabase
    .from("tours_operators")
    .select("*")
    .eq("user_id", session.user?.id || "")
    .maybeSingle();

  // Get all operators
  const { data: allOperators } = await supabase
    .from("tours_operators")
    .select("id, profile_id, user_id, business_name, accreditation_status")
    .limit(5);

  return (
    <PageFrame>
      <div className="mx-auto max-w-4xl space-y-6">
        <h1 className="text-3xl font-black">🔍 Debug Operator Profile</h1>

        {/* Current User */}
        <div className="rounded-2xl border bg-white p-6">
          <h2 className="mb-4 text-xl font-bold">Current User</h2>
          <pre className="overflow-auto rounded bg-gray-100 p-4 text-xs">
            {JSON.stringify(
              {
                id: session.user?.id,
                email: session.user?.email,
                role: session.role,
              },
              null,
              2
            )}
          </pre>
        </div>

        {/* Operator by profile_id */}
        <div className="rounded-2xl border bg-white p-6">
          <h2 className="mb-4 text-xl font-bold">
            Operator Query (profile_id = user.id)
          </h2>
          <pre className="overflow-auto rounded bg-gray-100 p-4 text-xs">
            {JSON.stringify(operatorByProfileId || "NOT FOUND", null, 2)}
          </pre>
        </div>

        {/* Operator by user_id */}
        <div className="rounded-2xl border bg-white p-6">
          <h2 className="mb-4 text-xl font-bold">
            Operator Query (user_id = user.id)
          </h2>
          <pre className="overflow-auto rounded bg-gray-100 p-4 text-xs">
            {JSON.stringify(operatorByUserId || "NOT FOUND", null, 2)}
          </pre>
        </div>

        {/* All Operators */}
        <div className="rounded-2xl border bg-white p-6">
          <h2 className="mb-4 text-xl font-bold">All Operators (first 5)</h2>
          <pre className="overflow-auto rounded bg-gray-100 p-4 text-xs">
            {JSON.stringify(allOperators || [], null, 2)}
          </pre>
        </div>
      </div>
    </PageFrame>
  );
}
