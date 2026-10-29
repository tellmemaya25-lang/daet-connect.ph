import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { PageFrame } from "@/components/ui/page-frame";
import { ConfirmSubmitButton } from "@/components/tours/confirm-submit-button";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatPeso, MERCH_CATEGORIES, MERCH_REVIEW_LABELS, MERCH_SUBMISSION_COLUMNS, type MerchSubmission } from "@/lib/tours/promo-validation";
import { getAuthenticatedSession } from "@/lib/tours/server-auth";
import { deleteMyMerch } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "My merchandise" };

const TONE: Record<MerchSubmission["review_status"], BadgeTone> = { pending: "warning", approved: "success", rejected: "danger" };

export default async function OperatorMerchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await getAuthenticatedSession();
  if (!session.user) redirect(`/login?next=${encodeURIComponent("/tours/operator/merch")}`);
  const supabase = await createSupabaseServerClient();
  const { data: operator } = session.role === "operator"
    ? await supabase.from("tours_operators").select("id, business_name, accreditation_status").eq("profile_id", session.user.id).maybeSingle()
    : { data: null };
  if (!operator || operator.accreditation_status !== "approved") {
    return (
      <PageFrame>
        <Notice variant="error" title="Operator access required">Only accredited tour operators can submit merchandise.</Notice>
      </PageFrame>
    );
  }

  const params = await searchParams;
  const { data } = await supabase
    .from("tours_merchandise")
    .select(MERCH_SUBMISSION_COLUMNS)
    .eq("submitted_by_operator_id", operator.id)
    .order("created_at", { ascending: false });
  const items = (data ?? []) as unknown as MerchSubmission[];

  return (
    <PageFrame>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link href="/tours/operator/dashboard" className="inline-flex min-h-11 items-center text-sm font-bold text-daet-forest hover:underline">
            ← Dashboard
          </Link>
          <p className="text-sm font-bold text-daet-leaf">{operator.business_name}</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-daet-ink">My merchandise</h1>
          <p className="mt-1 max-w-xl text-sm text-daet-ink/65">Sell shirts, souvenirs or pasalubong on the CONNECT-Daet merch showcase. The Tourism Office approves each product first.</p>
        </div>
        <ButtonLink href="/tours/operator/merch/new">+ Submit a product</ButtonLink>
      </div>

      {params.saved ? <Notice variant="success" className="mb-4">Sent to the Tourism Office for approval.</Notice> : null}
      {params.deleted ? <Notice variant="success" className="mb-4">Product removed.</Notice> : null}
      {params.error ? <Notice variant="error" className="mb-4">That action could not be completed.</Notice> : null}

      {items.length === 0 ? (
        <EmptyState icon="🛍️" title="No products yet" description="Submit your first product and we'll let you know when it's approved." />
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id} className="flex flex-col gap-3 rounded-2xl border border-daet-ink/10 bg-white p-4 shadow-sm sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-daet-sand text-2xl">
                  {item.image_url ? <img src={item.image_url} alt="" className="h-full w-full object-cover" /> : <span aria-hidden="true">🛍️</span>}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={TONE[item.review_status]}>{MERCH_REVIEW_LABELS[item.review_status]}</Badge>
                    <span className="text-xs text-daet-ink/70">{MERCH_CATEGORIES[item.category]}</span>
                    {item.review_status === "approved" && !item.is_active ? <span className="text-xs text-daet-ink/70">· hidden by you</span> : null}
                  </div>
                  <p className="mt-1 truncate font-black text-daet-ink">{item.name}</p>
                  <p className="text-sm text-daet-ink/70">{formatPeso(item.price) ?? "Ask seller"} · {item.seller_name}</p>
                  {item.review_status === "rejected" && item.review_notes ? (
                    <p className="mt-1 text-sm font-bold text-rose-700">Tourism Office: {item.review_notes}</p>
                  ) : null}
                </div>
              </div>
              <div className="flex gap-2">
                <ButtonLink href={`/tours/operator/merch/${item.id}/edit`} variant="secondary" className="flex-1 sm:flex-none">
                  Edit
                </ButtonLink>
                <form action={deleteMyMerch} className="flex-1 sm:flex-none">
                  <input type="hidden" name="id" value={item.id} />
                  <ConfirmSubmitButton
                    message={`Remove "${item.name}"? This cannot be undone.`}
                    className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-rose-200 px-5 text-sm font-bold text-rose-700 hover:bg-rose-50"
                  >
                    Remove
                  </ConfirmSubmitButton>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </PageFrame>
  );
}
