import type { SavedDay } from "@/lib/tours/itinerary/form";
import { formatClock } from "@/lib/tours/itinerary/types";
import { formatPeso } from "@/lib/money";

const longDate = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

export type PrintBooking = { reference: string; title: string; date: string; pax: number; status: string };

/**
 * A plain, paper-first copy of a saved plan: one table per day, no maps or
 * buttons, black on white. Printing it (or "Save as PDF") is the export.
 */
export function ItineraryPrintSheet({
  title,
  subtitle,
  summary,
  days,
  fees,
  bookings = [],
  link,
}: {
  title: string;
  subtitle: string | null;
  summary: string | null;
  days: SavedDay[];
  /** Entrance fee per place name, when known. */
  fees?: Map<string, number | null>;
  bookings?: PrintBooking[];
  /** The page's own address, printed in the footer so the paper leads back. */
  link: string | null;
}) {
  const printedOn = new Date().toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric", timeZone: "Asia/Manila" });
  return (
    <article className="mx-auto max-w-3xl bg-white p-6 text-slate-900 print:max-w-none print:p-0" aria-label="Printable itinerary">
      <header className="border-b-2 border-slate-900 pb-3">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-600">CONNECT-Daet · Trip itinerary</p>
        <h1 className="mt-1 text-3xl font-bold leading-tight">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-slate-700">{subtitle}</p> : null}
      </header>
      {summary ? <p className="mt-4 text-sm leading-6">{summary}</p> : null}

      {days.length === 0 ? <p className="mt-6 text-sm">This plan has no stops.</p> : null}
      {days.map((day) => (
        <section key={day.dayNumber} className="mt-6 break-inside-avoid-page">
          <h2 className="text-lg font-bold">
            Day {day.dayNumber}
            {day.date ? ` · ${longDate(day.date)}` : ""}
          </h2>
          <table className="mt-2 w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-400">
                <th scope="col" className="w-36 py-1.5 pr-3 font-bold">Time</th>
                <th scope="col" className="py-1.5 pr-3 font-bold">Stop</th>
                <th scope="col" className="w-32 py-1.5 font-bold">Cost</th>
              </tr>
            </thead>
            <tbody>
              {day.items.map((item, i) => {
                const fee = fees?.get(item.name);
                const cost = item.kind === "lunch" ? "Lunch" : fee ? `${formatPeso(fee)} entrance` : "Free";
                return (
                  <tr key={i} className="break-inside-avoid border-b border-slate-200 align-top">
                    <td className="py-2 pr-3 tabular-nums">
                      {item.start !== null ? formatClock(item.start) : ""}
                      {item.end !== null ? ` – ${formatClock(item.end)}` : ""}
                    </td>
                    <td className="py-2 pr-3">
                      <span className="font-bold">{item.kind === "lunch" ? `Lunch · ${item.name}` : item.name}</span>
                      {item.travelMinutes > 0 ? <span className="block text-xs text-slate-600">About {item.travelMinutes} min travel to get here</span> : null}
                      {item.tip ? <span className="mt-0.5 block text-xs text-slate-700">Tip: {item.tip}</span> : null}
                    </td>
                    <td className="py-2">{cost}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ))}

      {bookings.length ? (
        <section className="mt-6 break-inside-avoid-page">
          <h2 className="text-lg font-bold">Booked tours</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {bookings.map((b) => (
              <li key={b.reference}>
                <span className="font-bold">{b.title}</span> · {longDate(b.date)} · {b.pax} {b.pax === 1 ? "person" : "people"} · Ref {b.reference} ({b.status})
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <footer className="mt-8 border-t border-slate-300 pt-2 text-xs text-slate-600">
        Printed {printedOn}
        {link ? ` · ${link}` : ""} · Times and fees are estimates; check with each place before you go.
      </footer>
    </article>
  );
}
