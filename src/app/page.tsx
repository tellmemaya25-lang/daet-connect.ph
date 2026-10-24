import { PageFrame } from "@/components/ui/page-frame";
import { LandingView } from "@/components/landing/landing-view";
import type { PackageCardData } from "@/app/(subsystems)/tours/browse/package-card";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EVENT_COLUMNS, MERCH_COLUMNS, type MerchItem, type TourEvent } from "@/lib/tours/promo-validation";

export default async function HomePage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Every section hides itself when empty (or before migrations are applied).
  const [packagesResult, eventsResult, merchResult] = await Promise.all([
    supabase
      .from("tours_packages")
      .select("id, title, location_name, duration_value, duration_type, cover_image_url, tours_package_price_variants(price_per_pax, flat_price, is_default)")
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("tours_events")
      .select(EVENT_COLUMNS)
      .eq("is_published", true)
      .gte("ends_at", new Date().toISOString())
      .order("starts_at", { ascending: true })
      .limit(3),
    supabase
      .from("tours_merchandise")
      .select(MERCH_COLUMNS)
      .eq("is_active", true)
      .eq("is_featured", true)
      .order("created_at", { ascending: false })
      .limit(4),
  ]);

  return (
    <PageFrame>
      <LandingView
        signedIn={Boolean(user)}
        packages={(packagesResult.data ?? []) as unknown as PackageCardData[]}
        events={(eventsResult.data ?? []) as TourEvent[]}
        merch={(merchResult.data ?? []) as MerchItem[]}
      />
    </PageFrame>
  );
}
