import Link from "next/link";
import { PageFrame } from "@/components/ui/page-frame";
import { Notice } from "@/components/ui/notice";

/** Shown by the admin events/merch pages when the visitor is not an admin. */
export function PromoAdminDenied({ message, next }: { message: string; next: string }) {
  return (
    <PageFrame>
      <div className="mx-auto max-w-2xl py-8">
        <Notice variant="error" title="Admin access required">
          {message}{" "}
          <Link href={`/login?next=${encodeURIComponent(next)}`} className="font-bold underline underline-offset-4">
            Sign in
          </Link>
        </Notice>
      </div>
    </PageFrame>
  );
}

export function AdminPageHeading({
  eyebrow,
  title,
  backHref,
  backLabel,
  action,
}: {
  eyebrow: string;
  title: string;
  backHref: string;
  backLabel: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <Link href={backHref} className="inline-flex min-h-11 items-center text-sm font-bold text-daet-forest hover:underline">
          ← {backLabel}
        </Link>
        <p className="text-sm font-bold text-daet-leaf">{eyebrow}</p>
        <h1 className="mt-1 text-3xl font-black tracking-tight text-daet-ink">{title}</h1>
      </div>
      {action ? (
        <Link href={action.href} className="inline-flex min-h-11 items-center justify-center rounded-full bg-daet-forest px-6 text-sm font-bold text-white hover:bg-daet-ink">
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}
