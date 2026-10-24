import Link from "next/link";

export type PackageCardData = {
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

export function PackageCard({ package: pkg, featured = false }: { package: PackageCardData; featured?: boolean }) {
  const defaultVariant = pkg.tours_package_price_variants?.find((v) => v.is_default);
  const price = defaultVariant?.price_per_pax || defaultVariant?.flat_price || 0;
  const priceUnit = defaultVariant?.price_per_pax ? "per person" : "per group";

  return (
    <article className="group h-full overflow-hidden rounded-2xl bg-white transition duration-150 hover:bg-blue-50">
      <Link
        href={`/tours/packages/${pkg.id}`}
        className={`flex h-full flex-col focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${featured ? "lg:grid lg:grid-cols-[3fr_2fr]" : ""}`}
      >
        <div className={`relative overflow-hidden bg-blue-700 aspect-[4/3] ${featured ? "sm:aspect-[16/9] lg:aspect-auto lg:min-h-[420px]" : ""}`}>
          {pkg.cover_image_url ? (
            <img
              src={pkg.cover_image_url}
              alt=""
              className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
            />
          ) : (
            <p className="flex h-full items-end p-4 font-display text-3xl font-semibold leading-8 text-white">
              {pkg.location_name}
            </p>
          )}
        </div>
        <div className={`flex flex-1 flex-col p-4 sm:p-5 ${featured ? "lg:justify-center lg:p-10" : ""}`}>
          <p className="text-sm font-bold text-blue-700">
            {pkg.location_name} · {pkg.duration_value} {pkg.duration_value === 1 ? pkg.duration_type.replace(/s$/, "") : pkg.duration_type}
          </p>
          <h3 className={`mt-2 line-clamp-2 font-display font-semibold text-daet-ink ${featured ? "text-3xl leading-9 sm:text-4xl sm:leading-10" : "text-2xl leading-8"}`}>
            {pkg.title}
          </h3>
          <p className={`pt-3 text-sm text-daet-ink/80 ${featured ? "lg:text-base" : "mt-auto"}`}>
            {price > 0 ? (
              <>
                from <b className="text-lg text-daet-ink">₱{price.toLocaleString()}</b> {priceUnit}
              </>
            ) : (
              "Ask the operator for rates"
            )}
          </p>
          <p className="mt-3 flex items-center gap-1.5 text-sm font-bold text-green-800">
            <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4 shrink-0 fill-green-500">
              <path d="M10 1.5l2.2 1.4 2.6-.1 1.1 2.4 2.2 1.4-.6 2.5.6 2.5-2.2 1.4-1.1 2.4-2.6-.1L10 18.5l-2.2-1.4-2.6.1-1.1-2.4L1.9 13.4l.6-2.5-.6-2.5 2.2-1.4 1.1-2.4 2.6.1L10 1.5z" />
              <path d="M6.8 10.2l2.2 2.2 4.2-4.4" fill="none" stroke="#0f172a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Verified by the Tourism Office
          </p>
        </div>
      </Link>
    </article>
  );
}
