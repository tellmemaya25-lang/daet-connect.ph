import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { formatPeso } from "@/lib/money";
import { RANGE_PRESETS, type AnalyticsRange } from "@/lib/tours/dashboards";
import type { GuideEarnings, MoneyEarnings } from "@/lib/tours/earnings";

const day = (key: string) => new Date(`${key}T00:00:00+08:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" });

export function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <Card>
      <p className="text-sm text-slate-600 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-daet-ink">{value}</p>
      <p className="text-sm text-slate-600 dark:text-slate-400">{note}</p>
    </Card>
  );
}

/** 7 days / 30 days / 90 days / 12 months, or a custom range, kept in the address. */
export function RangePicker({ path, range, today }: { path: string; range: AnalyticsRange; today: string }) {
  return (
    <nav aria-label="Date range" className="mb-6 flex flex-wrap items-center gap-2">
      <div className="grid w-full grid-cols-4 gap-1 rounded-full bg-muted p-1 sm:w-auto">
        {RANGE_PRESETS.map((p) => (
          <Link
            key={p.key}
            href={`${path}?range=${p.key}`}
            aria-current={range.preset === p.key ? "page" : undefined}
            className={`inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-full px-2 text-sm font-bold sm:px-4 ${range.preset === p.key ? "bg-daet-forest text-white" : "text-daet-ink hover:bg-surface"}`}
          >
            {p.label}
          </Link>
        ))}
      </div>
      <form className="flex flex-wrap items-center gap-2 text-sm" action={path}>
        <label className="sr-only" htmlFor="from">
          From
        </label>
        <Input id="from" name="from" type="date" defaultValue={range.from} max={today} className="mt-0 min-h-11 w-auto rounded-full px-3" />
        <span aria-hidden="true">–</span>
        <label className="sr-only" htmlFor="to">
          To
        </label>
        <Input id="to" name="to" type="date" defaultValue={range.to} max={today} className="mt-0 min-h-11 w-auto rounded-full px-3" />
        <button type="submit" className="min-h-11 rounded-full border border-daet-forest/30 bg-surface px-4 font-bold text-daet-leaf hover:bg-daet-forest/5 dark:text-blue-300">
          Apply
        </button>
      </form>
      <p className="w-full text-sm text-daet-ink/70">
        {day(range.from)} – {day(range.to)}
      </p>
    </nav>
  );
}

/** A guide's pay: fees on completed tours, what confirmed tours will add, and each tour. */
export function GuideEarningsView({ past, upcoming }: { past: GuideEarnings; upcoming: GuideEarnings }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Earned" value={formatPeso(past.earned)} note={`${past.completedTours} completed tour${past.completedTours === 1 ? "" : "s"}`} />
        <Stat label="Coming up" value={formatPeso(upcoming.expected)} note={`${upcoming.upcomingTours} confirmed tour${upcoming.upcomingTours === 1 ? "" : "s"}, next 60 days`} />
        <Stat label="Average per tour" value={past.completedTours ? formatPeso(past.earned / past.completedTours) : "—"} note="completed tours with a fee" />
        <Stat label="Tours without a fee" value={String(past.unpricedTours)} note="ask the operator to set one" />
      </div>
      <EarningsTable title="Your tours" tours={[...upcoming.tours.filter((t) => t.status === "confirmed"), ...past.tours]} />
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Your fee for a tour is set by its operator and fixed when you are assigned. Operators pay guides directly; this page is your record.
      </p>
    </div>
  );
}

function EarningsTable({ title, tours }: { title: string; tours: GuideEarnings["tours"] }) {
  const seen = new Set<string>();
  const rows = tours.filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)));
  return (
    <section aria-label={title} className="rounded-2xl card-edge bg-surface p-5">
      <h2 className="text-lg font-bold text-daet-ink">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">No tours in this range.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="py-2 pr-3">Date</th>
                <th scope="col" className="py-2 pr-3">Tour</th>
                <th scope="col" className="py-2 pr-3">Guests</th>
                <th scope="col" className="py-2 pr-3">Status</th>
                <th scope="col" className="py-2 text-right">Your fee</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id} className="border-b border-line/60">
                  <td className="py-2 pr-3 whitespace-nowrap">{day(t.date)}</td>
                  <td className="py-2 pr-3">
                    {t.title} <span className="text-slate-600 dark:text-slate-400">· {t.reference}</span>
                  </td>
                  <td className="py-2 pr-3">{t.pax}</td>
                  <td className="py-2 pr-3">{t.status === "completed" ? "Completed" : "Confirmed"}</td>
                  <td className="py-2 text-right font-bold">{t.fee === null ? "No fee set" : formatPeso(t.fee)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** Operator (one row) or admin (every operator): booked, collected, refunded, guide fees and net. */
export function MoneyEarningsView({ data, perOperator }: { data: MoneyEarnings; perOperator: boolean }) {
  const t = data.totals;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Collected" value={formatPeso(t.collected)} note={`payments received${t.refunded ? `, ${formatPeso(t.refunded)} refunded` : ""}`} />
        <Stat label="Guide fees" value={formatPeso(t.guideFees)} note="owed on completed tours" />
        <Stat label="Net revenue" value={formatPeso(t.net)} note="collected − refunds − guide fees" />
        <Stat label="Booked" value={formatPeso(t.booked)} note={`${t.bookings} confirmed or completed${t.pickupFees ? `, incl. ${formatPeso(t.pickupFees)} pickups` : ""}`} />
      </div>

      {perOperator ? (
        <section aria-label="By operator" className="rounded-2xl card-edge bg-surface p-5">
          <h2 className="text-lg font-bold text-daet-ink">By operator</h2>
          {data.operators.length === 0 ? (
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">No approved operators yet.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[40rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-line">
                    <th scope="col" className="py-2 pr-3">Operator</th>
                    <th scope="col" className="py-2 pr-3 text-right">Bookings</th>
                    <th scope="col" className="py-2 pr-3 text-right">Collected</th>
                    <th scope="col" className="py-2 pr-3 text-right">Refunded</th>
                    <th scope="col" className="py-2 pr-3 text-right">Guide fees</th>
                    <th scope="col" className="py-2 text-right">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {data.operators.map((o) => (
                    <tr key={o.id} className="border-b border-line/60">
                      <td className="py-2 pr-3 font-bold">{o.name}</td>
                      <td className="py-2 pr-3 text-right">{o.bookings}</td>
                      <td className="py-2 pr-3 text-right">{formatPeso(o.collected)}</td>
                      <td className="py-2 pr-3 text-right">{formatPeso(o.refunded)}</td>
                      <td className="py-2 pr-3 text-right">{formatPeso(o.guideFees)}</td>
                      <td className="py-2 text-right font-bold">{formatPeso(o.net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      <section aria-label="Guide earnings" className="rounded-2xl card-edge bg-surface p-5">
        <h2 className="text-lg font-bold text-daet-ink">Guide earnings</h2>
        {data.guides.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">No guided tours in this range.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[28rem] text-left text-sm">
              <thead>
                <tr className="border-b border-line">
                  <th scope="col" className="py-2 pr-3">Guide</th>
                  <th scope="col" className="py-2 pr-3 text-right">Completed tours</th>
                  <th scope="col" className="py-2 pr-3 text-right">Earned</th>
                  <th scope="col" className="py-2 text-right">Coming up</th>
                </tr>
              </thead>
              <tbody>
                {data.guides.map((g) => (
                  <tr key={g.id} className="border-b border-line/60">
                    <td className="py-2 pr-3 font-bold">{g.name}</td>
                    <td className="py-2 pr-3 text-right">{g.completedTours}</td>
                    <td className="py-2 pr-3 text-right">{formatPeso(g.earned)}</td>
                    <td className="py-2 text-right">{formatPeso(g.expected)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Payments and refunds are counted by the day they were made; bookings and guide fees by the tour date. Guide fees come from each package&apos;s guide fee.
      </p>
    </div>
  );
}
