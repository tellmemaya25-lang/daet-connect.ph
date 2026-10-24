import Link from "next/link";
import { formatEventRange } from "@/lib/tours/events-calendar";
import { EVENT_CATEGORIES, type TourEvent } from "@/lib/tours/promo-validation";

export const EVENT_CATEGORY_STYLES: Record<TourEvent["category"], { dot: string; chip: string }> = {
  festival: { dot: "bg-daet-coral", chip: "bg-orange-50 text-orange-800" },
  cultural: { dot: "bg-violet-500", chip: "bg-violet-50 text-violet-800" },
  sports: { dot: "bg-sky-500", chip: "bg-sky-50 text-sky-800" },
  religious: { dot: "bg-daet-sun", chip: "bg-amber-50 text-amber-800" },
  market: { dot: "bg-daet-leaf", chip: "bg-emerald-50 text-emerald-800" },
  other: { dot: "bg-slate-400", chip: "bg-slate-100 text-slate-700" },
};

export function EventCard({ event, compact = false }: { event: TourEvent; compact?: boolean }) {
  const style = EVENT_CATEGORY_STYLES[event.category];
  return (
    <Link
      href={`/tours/events/${event.id}`}
      className="group flex gap-4 rounded-2xl border border-daet-ink/10 bg-white p-3 shadow-sm transition hover:shadow-md"
    >
      <div className={`grid shrink-0 place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-daet-forest to-daet-leaf text-2xl ${compact ? "h-16 w-16" : "h-20 w-20 sm:h-24 sm:w-24"}`}>
        {event.image_url ? (
          <img src={event.image_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <span aria-hidden="true">🎉</span>
        )}
      </div>
      <div className="min-w-0 flex-1 py-1">
        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-bold ${style.chip}`}>
          {EVENT_CATEGORIES[event.category]}
        </span>
        <p className="mt-1 line-clamp-2 font-black text-daet-ink group-hover:text-daet-forest">{event.title}</p>
        <p className="mt-0.5 text-sm text-daet-ink/65">{formatEventRange(event.starts_at, event.ends_at)}</p>
        <p className="truncate text-sm text-daet-ink/70">📍 {event.venue}</p>
      </div>
    </Link>
  );
}
