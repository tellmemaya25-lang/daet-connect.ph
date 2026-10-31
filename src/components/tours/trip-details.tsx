import { CheckIcon, LineIcon } from "@/components/ui/icons";
import { formatPeso } from "@/lib/money";
import { childPriceLabel, groupDealLabel, UNIT_LABEL } from "@/lib/tours/quote";
import { itineraryByDay, type TripDetails } from "@/lib/tours/trip-details";

type Variant = { id: string; variant_name: string; price_per_pax: number | null; flat_price: number | null; min_pax: number; max_pax: number | null; is_default: boolean };

/** Price options, itinerary, extras and terms on a package page; each section shows only when it has content. */
export function TripDetailsSections({ details, variants }: { details: TripDetails; variants: Variant[] }) {
  const days = itineraryByDay(details.itinerary);
  const showOptions = variants.length > 1 || variants.some((v) => details.rules[v.id]?.child_price_percent != null || details.rules[v.id]?.group_min_pax);
  const terms = details.depositPerPax != null || details.cancellationPolicy;

  return (
    <>
      {showOptions ? (
        <section aria-labelledby="price-options" className="mt-12">
          <h2 id="price-options" className="text-2xl font-semibold text-daet-ink sm:text-3xl">Price options</h2>
          <ul className="mt-4 space-y-2">
            {[...variants].sort((a, b) => Number(b.is_default) - Number(a.is_default)).map((v) => {
              const rules = { ...v, ...(details.rules[v.id] ?? {}) };
              const notes = [childPriceLabel(rules), groupDealLabel(rules, formatPeso), v.max_pax ? `Up to ${v.max_pax} guests` : null].filter(Boolean) as string[];
              return (
                <li key={v.id} className="rounded-2xl bg-surface p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <h3 className="font-bold text-daet-ink">{v.variant_name}</h3>
                    <p className="text-lg font-bold text-daet-ink">
                      {formatPeso(v.price_per_pax ?? v.flat_price ?? 0)}{" "}
                      <span className="text-sm font-semibold text-daet-ink/75">{v.price_per_pax != null ? "per person" : "for the group"}</span>
                    </p>
                  </div>
                  {notes.length ? <p className="mt-1 text-sm text-daet-ink/80">{notes.join(" · ")}</p> : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {days.length ? (
        <section aria-labelledby="day-by-day" className="mt-12">
          <h2 id="day-by-day" className="text-2xl font-semibold text-daet-ink sm:text-3xl">Day by day</h2>
          <div className="mt-4 space-y-4">
            {days.map(({ day, rows }) => (
              <div key={day} className="rounded-2xl bg-surface p-4 sm:p-5">
                <h3 className="font-bold text-daet-ink">Day {day}</h3>
                <ol className="mt-3 space-y-3">
                  {rows.map((row, i) => (
                    <li key={row.id ?? i} className="grid grid-cols-[5.5rem_1fr] gap-3 text-daet-ink">
                      <span className="text-sm font-bold tabular-nums text-blue-700 dark:text-blue-300">{row.start_time ?? ""}</span>
                      <span className="leading-snug">{row.activity}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
          <p className="mt-2 text-sm text-daet-ink/75">Times can shift with the tide, weather and traffic.</p>
        </section>
      ) : null}

      {details.addons.length ? (
        <section aria-labelledby="extras" className="mt-12">
          <h2 id="extras" className="text-2xl font-semibold text-daet-ink sm:text-3xl">Optional extras</h2>
          <p className="mt-2 text-daet-ink/80">Add these when you book, or arrange them with the operator. Extras marked “on site” are paid on the day.</p>
          <ul className="mt-4 divide-y divide-daet-ink/10 rounded-2xl bg-surface px-4">
            {details.addons.map((a) => (
              <li key={a.id} className="flex items-start justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="font-bold text-daet-ink">{a.name}</p>
                  <p className="text-sm text-daet-ink/75">
                    {[a.max_guests ? `Up to ${a.max_guests} guests` : null, a.needs_reservation ? "Needs reservation" : null, a.bookable ? null : "On site", a.note].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <p className="shrink-0 text-right font-bold text-daet-ink">
                  {formatPeso(a.price)}
                  <span className="block text-sm font-semibold text-daet-ink/75">{UNIT_LABEL[a.unit]}</span>
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {details.thingsToBring.length || details.goodToKnow ? (
        <section aria-labelledby="good-to-know" className="mt-12">
          <h2 id="good-to-know" className="text-2xl font-semibold text-daet-ink sm:text-3xl">Good to know</h2>
          <div className="mt-4 grid gap-6 sm:grid-cols-2">
            {details.thingsToBring.length ? (
              <div>
                <h3 className="font-bold text-daet-ink">Things to bring</h3>
                <ul className="mt-3 space-y-2">
                  {details.thingsToBring.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-daet-ink">
                      <CheckIcon className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-300" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {details.goodToKnow ? (
              <div className="space-y-2 text-daet-ink">
                {details.goodToKnow.split(/\n+/).map((line) => (
                  <p key={line} className="flex items-start gap-2">
                    <LineIcon name="tip" className="mt-0.5 h-5 w-5 shrink-0 text-daet-ink/70" />
                    {line}
                  </p>
                ))}
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {terms ? (
        <section aria-labelledby="terms" className="mt-12 rounded-2xl bg-surface p-5 sm:p-6">
          <h2 id="terms" className="text-2xl font-semibold text-daet-ink">Reservation and cancellation</h2>
          {details.depositPerPax != null ? (
            <p className="mt-2 font-bold text-daet-ink">
              Reservation fee: {formatPeso(details.depositPerPax)} per person, taken off the total{details.depositRefundable ? "." : ", not refundable."}
            </p>
          ) : null}
          {details.cancellationPolicy ? <p className="mt-2 text-daet-ink">{details.cancellationPolicy}</p> : null}
        </section>
      ) : null}
    </>
  );
}

/** The booking panel's cancellation line: the operator's own terms when they have a non-refundable fee. */
export function cancellationLine(details: TripDetails, freeHours: number): string {
  if (details.depositPerPax != null && !details.depositRefundable) return `${formatPeso(details.depositPerPax)} reservation fee per person, not refundable`;
  return `Free cancellation up to ${freeHours} hours before`;
}
