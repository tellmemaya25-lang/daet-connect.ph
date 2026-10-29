import { formatPeso } from "@/lib/money";
import Link from "next/link";
import { RatingBadge } from "@/components/tours/star-rating";
import { ClockIcon, MapPinIcon } from "@/components/ui/icons";
import type { RatingSummary } from "@/lib/tours/reviews";

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
  rating?: RatingSummary | null;
}

export function PackageCard({ package: pkg, rating = null }: PackageCardProps) {
  const defaultVariant = pkg.tours_package_price_variants?.find((v) => v.is_default);
  const price = defaultVariant?.price_per_pax || defaultVariant?.flat_price || 0;
  const priceLabel = defaultVariant?.price_per_pax ? "per person" : "per group";

  return (
    <article className="group overflow-hidden rounded-2xl bg-white transition hover:shadow-card">
      <Link href={`/tours/packages/${pkg.id}`}>
        {/* Cover Image */}
        <div className="relative aspect-video overflow-hidden bg-daet-leaf">
          {pkg.cover_image_url ? (
            <img
              src={pkg.cover_image_url}
              alt={pkg.title}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full items-end p-4 font-display text-2xl text-white">{pkg.location_name}</div>
          )}
          {/* Price Badge */}
          <div className="absolute bottom-3 right-3 rounded-full bg-white px-4 py-2 shadow-lg">
            <p className="text-xs font-bold text-daet-ink/70">From</p>
            <p className="text-lg font-black text-daet-forest">
              {formatPeso(price)}
            </p>
            <p className="text-[10px] font-bold text-daet-ink/70">{priceLabel}</p>
          </div>
        </div>

        {/* Content */}
        <div className="p-5">
          <h2 className="line-clamp-2 min-h-[3rem] font-black text-daet-ink group-hover:text-daet-forest">
            {pkg.title}
          </h2>

          <div className="mt-3 flex items-center gap-4 text-sm text-daet-ink/70">
            <span className="flex items-center gap-1">
              <MapPinIcon />
              {pkg.location_name}
            </span>
            <span className="flex items-center gap-1">
              <ClockIcon />
              {pkg.duration_value} {pkg.duration_type}
            </span>
          </div>

          <div className="mt-4 flex items-center justify-between gap-2 border-t border-daet-ink/10 pt-4">
            {rating ? <RatingBadge summary={rating} compact /> : <span className="text-xs font-bold text-daet-ink/70">New · no reviews yet</span>}
            <span className="text-sm font-bold text-daet-forest group-hover:underline">
              View details →
            </span>
          </div>
        </div>
      </Link>
    </article>
  );
}
