import Link from "next/link";
import { redirect } from "next/navigation";
import { QrVerifyScanner } from "@/components/tours/qr-verify-scanner";
import { Card } from "@/components/ui/card";
import { PageFrame } from "@/components/ui/page-frame";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthenticatedSession } from "@/lib/tours/server-auth";

export const metadata = { title: "Scan QR" };

/** The tourist-ticket scanner on its own page, so an operator at the meeting point is one tap from it. */
export default async function OperatorScanPage() {
  const session = await getAuthenticatedSession();
  if (!session.user) redirect(`/login?next=${encodeURIComponent("/tours/operator/scan")}`);
  if (session.role !== "operator") redirect("/dashboard");
  const supabase = await createSupabaseServerClient();
  const { data: operator } = await supabase.from("tours_operators").select("accreditation_status").eq("profile_id", session.user.id).maybeSingle();
  if (!operator) redirect("/tours/operator/register");
  if (operator.accreditation_status !== "approved") redirect(operator.accreditation_status === "rejected" ? "/tours/operator/register" : "/tours/operator/pending");

  return (
    <PageFrame>
      <Link href="/tours/operator/dashboard" className="inline-flex min-h-11 items-center text-sm font-bold text-daet-forest hover:underline dark:text-blue-300">
        ← Dashboard
      </Link>
      <h1 className="display-2 mb-4 text-daet-ink">Scan QR</h1>
      <Card className="max-w-2xl">
        <QrVerifyScanner expectedType="booking" showHeader={false} />
      </Card>
    </PageFrame>
  );
}
