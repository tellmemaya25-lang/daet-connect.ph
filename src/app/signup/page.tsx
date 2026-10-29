import { redirect } from "next/navigation";
import { PageFrame } from "@/components/ui/page-frame";
import { Notice } from "@/components/ui/notice";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { safeNextPath } from "@/lib/safe-redirect";
import { SignupForm } from "./signup-form";

export const dynamic = "force-dynamic";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const nextUrl = safeNextPath((await searchParams).next);
  if (!isSupabaseConfigured()) {
    return (
      <PageFrame>
        <div className="mx-auto max-w-md py-8">
          <Notice variant="warning" title="Supabase setup required">
            Configure Supabase environment variables before creating an account.
          </Notice>
        </div>
      </PageFrame>
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();

  if (data?.user) {
    redirect(nextUrl);
  }

  return (
    <PageFrame>
      <div className="mx-auto max-w-md">
        <section className="rounded-2xl bg-white p-6 sm:p-10">
          <h1 className="text-3xl font-black text-daet-ink">Create account</h1>
          <p className="mt-2 text-sm leading-6 text-daet-ink/65">
            Create an account to book trips, message your guide and keep your tickets in one place.
          </p>
          <SignupForm nextUrl={nextUrl} />
        </section>
      </div>
    </PageFrame>
  );
}
