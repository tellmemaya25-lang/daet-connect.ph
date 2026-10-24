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
  const start = new Date(event.starts_at);
  const day = new Intl.DateTimeFormat("en-PH", { day: "numeric", timeZone: "Asia/Manila" }).format(start);
  const month = new Intl.DateTimeFormat("en-PH", { month: "short", timeZone: "Asia/Manila" }).format(start);
  return (
    <Link
      href={`/tours/events/${event.id}`}
      className="group flex items-center gap-4 rounded-2xl bg-daet-foam p-4 shadow-card transition duration-150 hover:shadow-lift"
    >
      <div className={`shrink-0 overflow-hidden rounded-xl bg-daet-sea text-center ${compact ? "w-16 py-2" : "w-20 py-3"}`}>
        <p className="font-display text-3xl font-semibold leading-8 text-daet-ink">{day}</p>
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-daet-forest">{month}</p>
      </div>
      <div className="min-w-0 flex-1">
        <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${style.chip}`}>
          {EVENT_CATEGORIES[event.category]}
        </span>
        <p className="mt-1 line-clamp-2 font-display text-lg font-semibold leading-6 text-daet-ink group-hover:text-daet-forest">{event.title}</p>
        <p className="mt-0.5 text-sm text-daet-ink/70">{formatEventRange(event.starts_at, event.ends_at)}</p>
        <p className="truncate text-sm text-daet-ink/70">{event.venue}</p>
      </div>
    </Link>
  );
}
