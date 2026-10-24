import { redirect } from "next/navigation";
import { PageFrame } from "@/components/ui/page-frame";
import { Notice } from "@/components/ui/notice";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getPaymongoConfig } from "@/lib/paymongo/client";
import { safeNextPath } from "@/lib/safe-redirect";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ next?: string }>;

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  if (!isSupabaseConfigured()) {
    return (
      <PageFrame>
        <div className="mx-auto max-w-md py-8">
          <Notice variant="warning" title="Supabase setup required">
            Configure Supabase environment variables before signing in.
          </Notice>
        </div>
      </PageFrame>
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();

  if (data?.user) {
    const params = await searchParams;
    redirect(safeNextPath(params.next));
  }

  const params = await searchParams;
  const nextUrl = safeNextPath(params.next);
  const livePayments = getPaymongoConfig()?.mode === "live";

  return (
    <PageFrame>
      <div className="mx-auto max-w-md">
        <section className="rounded-3xl border border-daet-ink/10 bg-white p-6 shadow-card sm:p-10">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-daet-leaf">CONNECT-DAET</p>
          <h1 className="mt-2 text-3xl font-black text-daet-ink">Sign in</h1>
          <p className="mt-2 text-sm leading-6 text-daet-ink/65">
            Enter your email and password to access your account.
          </p>
          <LoginForm nextUrl={nextUrl} />
        </section>
        {livePayments ? null : (
          <Notice variant="info" title="Test environment: no real money" className="mt-4">
            Online payments here use the PayMongo test sandbox (use its test cards and e-wallets), and receipt uploads are for practice. Nothing is charged.
          </Notice>
        )}
      </div>
    </PageFrame>
  );
}
