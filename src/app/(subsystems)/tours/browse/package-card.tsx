import Link from "next/link";

interface PackageCardProps {
  package: {
    id: string;
    title: string;
    location_name: string;
    duration_value: number;
    duration_type: string;
    cover_image_url: string | null;
    tours_package_price_variants?: Array<{
      price_per_pax: number | null;
      flat_price: number | null;
      is_default: boolean;
    }>;
  };
}

export function PackageCard({ package: pkg }: PackageCardProps) {
  const defaultVariant = pkg.tours_package_price_variants?.find((v) => v.is_default);
  const price = defaultVariant?.price_per_pax || defaultVariant?.flat_price || 0;
  const priceUnit = defaultVariant?.price_per_pax ? "per person" : "per group";

  return (
    <article className="group overflow-hidden rounded-2xl bg-daet-foam shadow-card transition duration-150 hover:shadow-lift">
      <Link
        href={`/tours/packages/${pkg.id}`}
        className="block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-daet-forest"
      >
        <div className="relative aspect-[4/3] overflow-hidden bg-daet-deep">
          {pkg.cover_image_url ? (
            <img
              src={pkg.cover_image_url}
              alt=""
              className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
            />
          ) : (
            <p className="flex h-full items-end p-4 font-display text-3xl font-semibold leading-8 text-daet-foam">
              {pkg.location_name}
            </p>
          )}
        </div>
        <div className="p-4 sm:p-5">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-daet-forest">
            {pkg.location_name} · {pkg.duration_value} {pkg.duration_type}
          </p>
          <h3 className="mt-2 line-clamp-2 min-h-[4rem] font-display text-2xl font-semibold leading-8 text-daet-ink">
            {pkg.title}
          </h3>
          <p className="mt-2 text-sm text-daet-ink/70">
            {price > 0 ? (
              <>
                from <b className="text-lg text-daet-ink">₱{price.toLocaleString()}</b> {priceUnit}
              </>
            ) : (
              "Ask the operator for rates"
            )}
          </p>
        </div>
      </Link>
    </article>
  );
}
