import type { Metadata } from "next";
import { Notice } from "@/components/ui/notice";
import { PageFrame } from "@/components/ui/page-frame";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { ForgotPasswordForm } from "./form";

export const metadata: Metadata = { title: "Reset your password" };
export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ message?: string }> }) {
  const { message } = await searchParams;
  return (
    <PageFrame>
      <div className="mx-auto max-w-md">
        <section className="rounded-2xl bg-white p-6 sm:p-10">
          <h1 className="text-3xl font-black text-daet-ink">Reset your password</h1>
          <p className="mt-2 text-sm leading-6 text-daet-ink/80">
            Enter your email and we will send you a link to choose a new password.
          </p>
          {isSupabaseConfigured() ? (
            <ForgotPasswordForm notice={message?.slice(0, 160)} />
          ) : (
            <Notice variant="warning" className="mt-6">
              Password reset is not available yet. Please contact the Daet Tourism Office.
            </Notice>
          )}
        </section>
      </div>
    </PageFrame>
  );
}
