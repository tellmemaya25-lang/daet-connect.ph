import Link from "next/link";
import { LineIcon } from "@/components/ui/icons";
import { formatPeso } from "@/lib/money";

export type HomeTrip = {
  id: string;
  title: string;
  locationName: string;
  /** "3 days", "2 hours" — already worded by durationLabel. */
  duration: string;
  /** The cheapest price on any variant, or null when the operator set none. */
  price: number | null;
  perPerson: boolean;
  operator: string | null;
};

/**
 * A trip on the home page: the place it goes to, the name, how long it takes
 * and the cheapest price, plus who runs it.
 *
 * No photograph: the design system's rule for a card without a found photo is
 * a brand-deep block carrying the place name, which is what the location chip
 * is. Nothing here invents a picture or a price.
 */
export function TripCard({ trip }: { trip: HomeTrip }) {
  return (
    <article className="hover-lift h-full rounded-2xl bg-surface">
      <Link href={`/tours/packages/${trip.id}`} className="flex h-full flex-col p-5">
        <span className="inline-flex w-fit items-center gap-1 rounded-full bg-blue-900 px-3 py-1 text-xs font-bold text-white">
          <LineIcon name="pin" className="h-3.5 w-3.5" />
          {trip.locationName}
        </span>
        <h3 className="mt-3 text-xl font-bold leading-snug text-daet-ink">{trip.title}</h3>
        <p className="mt-2 text-daet-ink/85">
          {trip.duration}
          {trip.price !== null && ` · from ${formatPeso(trip.price)} ${trip.perPerson ? "per person" : "for the trip"}`}
        </p>
        {trip.operator && <p className="mt-auto pt-4 text-sm text-daet-ink/75">Run by {trip.operator}</p>}
      </Link>
    </article>
  );
}
