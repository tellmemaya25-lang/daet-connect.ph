import { Stat } from "@/components/tours/earnings-view";
import { formatPeso } from "@/lib/money";
import { cancellationRate, methodLabel, type AdminRevenue } from "@/lib/tours/admin-moderation";
import { monthLabel } from "@/lib/tours/earnings";

const STATUS_LABEL: Record<string, string> = { pending: "Pending", confirmed: "Confirmed", completed: "Completed", cancelled: "Cancelled", no_show: "No-show" };

/** The admin's money overview: totals, month by month, payment methods, booking outcomes and top packages. */
export function AdminRevenueView({ data }: { data: AdminRevenue }) {
  const top = Math.max(1, ...data.months.map((m) => Math.max(m.booked, m.collected)));
  const methodsTotal = data.methods.reduce((s, m) => s + m.amount, 0) || 1;
  return (
    <div className="mb-8 space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Booked" value={formatPeso(data.booked)} note={`${data.bookings} bookings · ${data.guests} guests`} />
        <Stat label="Collected" value={formatPeso(data.collected)} note={`${formatPeso(data.pendingPayments)} waiting to be verified`} />
        <Stat label="Refunded" value={formatPeso(data.refunded)} note={`${cancellationRate(data.statuses)}% of bookings cancelled`} />
        <Stat label="Average booking" value={formatPeso(data.averageBooking)} note="confirmed and completed" />
      </div>

      <section aria-label="Month by month" className="rounded-2xl card-edge bg-surface p-5">
        <h2 className="text-lg font-bold text-daet-ink">Month by month</h2>
        {data.months.length === 0 ? (
          <p className="mt-2 text-sm text-daet-ink/70">No bookings or payments in this range.</p>
        ) : (
          <div className="mt-3 overflow-x-auto" tabIndex={0} role="group" aria-label="Month by month table">
            <table className="w-full text-left text-xs sm:min-w-[30rem] sm:text-sm">
              <thead>
                <tr className="border-b border-line">
                  <th scope="col" className="py-2 pr-2 sm:pr-3">Month</th>
                  <th scope="col" className="py-2 pr-2 sm:pr-3 text-right">Booked</th>
                  <th scope="col" className="py-2 pr-2 sm:pr-3 text-right">Collected</th>
                  <th scope="col" className="py-2 pr-2 sm:pr-3 text-right">Refunded</th>
                  <th scope="col" className="hidden w-1/3 py-2 sm:table-cell"><span className="sr-only">Collected, as a bar</span></th>
                </tr>
              </thead>
              <tbody>
                {data.months.map((m) => (
                  <tr key={m.month} className="border-b border-line/60">
                    <th scope="row" className="py-2 pr-2 sm:pr-3 font-bold">{monthLabel(m.month)}</th>
                    <td className="py-2 pr-2 sm:pr-3 text-right">{formatPeso(m.booked)}</td>
                    <td className="py-2 pr-2 sm:pr-3 text-right">{formatPeso(m.collected)}</td>
                    <td className="py-2 pr-2 sm:pr-3 text-right">{formatPeso(m.refunded)}</td>
                    <td className="hidden py-2 sm:table-cell" aria-hidden="true">
                      <div className="h-2 rounded-full bg-muted">
                        <div className="h-2 rounded-full bg-daet-forest" style={{ width: `${Math.round((m.collected / top) * 100)}%` }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <section aria-label="Payment methods" className="rounded-2xl card-edge bg-surface p-5">
          <h2 className="text-lg font-bold text-daet-ink">Payment methods</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {data.methods.length === 0 ? <li className="text-daet-ink/70">No payments collected.</li> : null}
            {data.methods.map((m) => (
              <li key={m.method} className="flex justify-between gap-2">
                <span>
                  {methodLabel(m.method)} <span className="text-daet-ink/70">· {m.count}</span>
                </span>
                <span className="font-bold">
                  {formatPeso(m.amount)} <span className="font-normal text-daet-ink/70">({Math.round((m.amount / methodsTotal) * 100)}%)</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
        <section aria-label="Booking outcomes" className="rounded-2xl card-edge bg-surface p-5">
          <h2 className="text-lg font-bold text-daet-ink">Booking outcomes</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {data.statuses.length === 0 ? <li className="text-daet-ink/70">No bookings.</li> : null}
            {data.statuses.map((s) => (
              <li key={s.status} className="flex justify-between gap-2">
                <span>{STATUS_LABEL[s.status] ?? s.status}</span>
                <span className="font-bold">
                  {s.count} <span className="font-normal text-daet-ink/70">· {formatPeso(s.amount)}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
        <section aria-label="Top packages" className="rounded-2xl card-edge bg-surface p-5">
          <h2 className="text-lg font-bold text-daet-ink">Top packages</h2>
          <ol className="mt-3 space-y-2 text-sm">
            {data.topPackages.length === 0 ? <li className="text-daet-ink/70">No bookings.</li> : null}
            {data.topPackages.map((p) => (
              <li key={p.id} className="flex justify-between gap-2">
                <span className="min-w-0">
                  <span className="font-bold text-daet-ink">{p.title}</span>
                  <span className="block text-xs text-daet-ink/70">
                    {p.operator} · {p.bookings} booking{p.bookings === 1 ? "" : "s"}
                  </span>
                </span>
                <span className="font-bold">{formatPeso(p.booked)}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
