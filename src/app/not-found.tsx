import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button";
import { PageFrame } from "@/components/ui/page-frame";

export const metadata: Metadata = { title: "Page not found" };

/** Every notFound() lands here, inside the normal header (navigation, bell, Sign out) and tab bar. */
export default function NotFound() {
  return (
    <PageFrame>
      <section className="mx-auto max-w-xl rounded-3xl border border-daet-ink/10 bg-white p-8 text-center shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-daet-leaf">Error 404</p>
        <h1 className="mt-2 text-3xl font-black text-daet-ink">Page not found</h1>
        <p className="mt-3 text-sm leading-6 text-daet-ink/70">
          This page doesn&apos;t exist, was removed, or isn&apos;t available to your account.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <ButtonLink href="/dashboard">Go to my dashboard</ButtonLink>
          <ButtonLink href="/" variant="secondary">
            Home
          </ButtonLink>
        </div>
      </section>
    </PageFrame>
  );
}
