import Link from "next/link";
import { PageFrame } from "@/components/ui/page-frame";
import { Notice } from "@/components/ui/notice";
import { AdminPageHeading, PromoAdminDenied } from "@/components/tours/promo-admin-denied";
import { ConfirmSubmitButton } from "@/components/tours/confirm-submit-button";
import { requirePromoAdmin } from "@/lib/tours/promo-admin";
import { formatPeso, MERCH_CATEGORIES, MERCH_COLUMNS, type MerchItem } from "@/lib/tours/promo-validation";
import { deleteMerch } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Manage merchandise" };

export default async function AdminMerchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await requirePromoAdmin();
  if (!admin.ok) return <PromoAdminDenied message={admin.error} next="/tours/admin/merch" />;

  const params = await searchParams;
  const { data, error } = await admin.supabase
    .from("tours_merchandise")
    .select(MERCH_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(200);
  const items = (data ?? []) as MerchItem[];

  return (
    <PageFrame adminNav>
      <AdminPageHeading
        eyebrow="Tourism Office"
        title="Merchandise"
        backHref="/tours/admin"
        backLabel="Admin dashboard"
        action={{ href: "/tours/admin/merch/new", label: "+ Add product" }}
      />

      {params.saved ? <Notice variant="success" className="mb-4">Product saved.</Notice> : null}
      {params.deleted ? <Notice variant="success" className="mb-4">Product deleted.</Notice> : null}
      {params.error ? <Notice variant="error" className="mb-4">That action could not be completed.</Notice> : null}
      {error ? <Notice variant="error" className="mb-4">Products could not be loaded. Has the merchandise migration been applied?</Notice> : null}

      {items.length === 0 && !error ? (
        <div className="rounded-2xl border border-dashed border-daet-ink/20 bg-white p-8 text-center">
          <p className="text-4xl" aria-hidden="true">🛍️</p>
          <p className="mt-2 font-bold text-daet-ink">No products yet</p>
          <p className="text-sm text-daet-ink/60">Advertise local t-shirts, mugs, souvenirs and pasalubong.</p>
        </div>
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
                    <span className="rounded-full bg-daet-sand px-2 py-0.5 text-xs font-bold text-daet-forest">{MERCH_CATEGORIES[item.category]}</span>
                    {item.is_active ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700">Visible</span>
                    ) : (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700">Hidden</span>
                    )}
                    {item.is_featured ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">★ Featured</span> : null}
                  </div>
                  <p className="mt-1 truncate font-black text-daet-ink">{item.name}</p>
                  <p className="text-sm text-daet-ink/60">
                    {formatPeso(item.price) ?? "Ask seller"} · {item.seller_name}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Link href={`/tours/admin/merch/${item.id}/edit`} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full border border-daet-forest/30 px-5 text-sm font-bold text-daet-forest hover:bg-daet-forest/5 sm:flex-none">
                  Edit
                </Link>
                <form action={deleteMerch} className="flex-1 sm:flex-none">
                  <input type="hidden" name="id" value={item.id} />
                  <ConfirmSubmitButton
                    message={`Delete "${item.name}"? This cannot be undone.`}
                    className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-rose-200 px-5 text-sm font-bold text-rose-700 hover:bg-rose-50"
                  >
                    Delete
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
