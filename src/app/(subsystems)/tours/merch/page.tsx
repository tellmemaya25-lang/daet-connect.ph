import Link from "next/link";
import { PageFrame } from "@/components/ui/page-frame";
import { Notice } from "@/components/ui/notice";
import { MerchCard } from "@/components/tours/merch-card";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isMerchCategory, MERCH_CATEGORIES, MERCH_COLUMNS, type MerchItem } from "@/lib/tours/promo-validation";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Daet merchandise",
  description: "T-shirts, mugs, souvenirs and pasalubong from local Daet sellers.",
};

export default async function MerchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const category = isMerchCategory(params.category) ? params.category : null;

  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("tours_merchandise")
    .select(MERCH_COLUMNS)
    .eq("is_active", true)
    .order("is_featured", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(120);
  if (category) query = query.eq("category", category);
  const { data, error } = await query;
  const items = (data ?? []) as MerchItem[];

  const chipClass = (active: boolean) =>
    `inline-flex min-h-11 items-center rounded-full px-4 text-sm font-bold transition ${active ? "bg-daet-forest text-white" : "border border-daet-ink/15 bg-white text-daet-ink hover:bg-daet-sand"}`;

  return (
    <PageFrame>
      <header className="mb-6 overflow-hidden rounded-2xl bg-daet-forest px-5 py-8 text-white sm:px-8">
        <p className="text-sm font-bold text-white">Take a piece of Daet home</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Daet merchandise</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-white">
          T-shirts, mugs, souvenirs and pasalubong from local sellers. Contact the seller directly or visit their shop to buy.
        </p>
      </header>

      <nav aria-label="Filter by category" className="-mx-4 mb-6 overflow-x-auto px-4">
        <ul className="flex w-max gap-2">
          <li>
            <Link href="/tours/merch" aria-current={category === null ? "page" : undefined} className={chipClass(category === null)}>
              All
            </Link>
          </li>
          {Object.entries(MERCH_CATEGORIES).map(([value, label]) => (
            <li key={value}>
              <Link href={`/tours/merch?category=${value}`} aria-current={category === value ? "page" : undefined} className={chipClass(category === value)}>
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {error ? <Notice variant="error" className="mb-6">Products could not be loaded right now. Please try again later.</Notice> : null}

      {items.length > 0 ? (
        <ul className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((item) => (
            <li key={item.id} className="flex">
              <MerchCard item={item} />
            </li>
          ))}
        </ul>
      ) : !error ? (
        <div className="rounded-2xl border border-dashed border-daet-ink/20 bg-white p-8 text-center">
          <p className="text-4xl" aria-hidden="true">🛍️</p>
          <p className="mt-2 font-bold text-daet-ink">No products in this category yet</p>
          <p className="text-sm text-daet-ink/70">Check back soon for new Daet souvenirs.</p>
        </div>
      ) : null}

      <p className="mt-8 text-center text-xs text-daet-ink/70">
        Listings are advertisements. Prices and availability are set by each seller.
      </p>
    </PageFrame>
  );
}
