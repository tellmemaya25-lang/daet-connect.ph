import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageFrame } from "@/components/ui/page-frame";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { ResetPasswordForm } from "./form";

export const metadata: Metadata = { title: "Choose a new password" };
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage() {
  if (!isSupabaseConfigured()) redirect("/forgot-password");

  // Only reachable through the email link, which signs the visitor in briefly.
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data?.user) {
    redirect("/forgot-password?message=" + encodeURIComponent("That link has expired. Request a new one."));
  }

  return (
    <PageFrame>
      <div className="mx-auto max-w-md">
        <section className="rounded-2xl bg-white p-6 shadow-card sm:p-10">
          <h1 className="text-3xl font-black text-daet-ink">Choose a new password</h1>
          <p className="mt-2 text-sm leading-6 text-daet-ink/80">You will stay signed in once it is saved.</p>
          <ResetPasswordForm />
        </section>
      </div>
    </PageFrame>
  );
}
