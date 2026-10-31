"use client";

import { formatPeso } from "@/lib/money";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DateOption } from "@/lib/tours/availability";
import { addonMax, childPriceLabel, groupDealLabel, hasChildPrice, quoteBooking, UNIT_LABEL } from "@/lib/tours/quote";
import { EMPTY_TRIP_DETAILS, type TripDetails } from "@/lib/tours/trip-details";
import { createBooking } from "./actions";

interface PriceVariant {
  id: string;
  variant_name: string;
  price_per_pax: number | null;
  flat_price: number | null;
  min_pax: number;
  max_pax: number | null;
  is_default: boolean;
}

interface BookingFormProps {
  packageId: string;
  priceVariants: PriceVariant[];
  /** Open dates when the operator manages availability; null = any future date. */
  dateOptions: DateOption[] | null;
  userProfile: {
    fullName: string;
    email: string;
  };
  /** Child and group rules, extras and the reservation fee. */
  details?: TripDetails;
}

const formatOpenDate = (dateKey: string) =>
  new Date(`${dateKey}T00:00:00Z`).toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export function BookingForm({ packageId, priceVariants, dateOptions, userProfile, details = EMPTY_TRIP_DETAILS }: BookingFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [tourDate, setTourDate] = useState(dateOptions?.find((option) => !option.full)?.date ?? "");
  const [numberOfPax, setNumberOfPax] = useState(1);
  const [selectedVariantId, setSelectedVariantId] = useState(
    priceVariants.find((v) => v.is_default)?.id || priceVariants[0]?.id || ""
  );
  const [contactName, setContactName] = useState(userProfile.fullName);
  const [contactEmail, setContactEmail] = useState(userProfile.email);
  const [contactPhone, setContactPhone] = useState("");
  const [specialRequests, setSpecialRequests] = useState("");
  const [children, setChildren] = useState(0);
  const [chosen, setChosen] = useState<Record<string, number>>({});

  // Get selected variant
  const selectedVariant = priceVariants.find((v) => v.id === selectedVariantId);

  // The same maths the database uses when it saves the booking (src/lib/tours/quote.ts).
  const rules = selectedVariant ? { ...selectedVariant, ...(details.rules[selectedVariant.id] ?? {}) } : null;
  const childOption = rules ? hasChildPrice(rules) : false;
  const bookableExtras = details.addons.filter((a) => a.bookable);
  const onSiteExtras = details.addons.filter((a) => !a.bookable);
  const quote = rules
    ? quoteBooking({ variant: rules, guests: numberOfPax, children: childOption ? children : 0, addons: details.addons, chosen, depositPerPax: details.depositPerPax, peso: formatPeso })
    : null;
  const totalAmount = quote?.total ?? 0;

  // Get min date (tomorrow in Manila, not in the visitor's or the server's zone)
  const getMinDate = () => {
    const manilaTomorrow = new Date(Date.now() + (8 + 24) * 60 * 60 * 1000);
    return manilaTomorrow.toISOString().split("T")[0];
  };

  const selectedDate = dateOptions?.find((option) => option.date === tourDate);
  const seatLimit = selectedDate ? selectedDate.seatsLeft : Infinity;

  // Handle pax change with validation
  const handlePaxChange = (value: number) => {
    if (!selectedVariant) return;

    const min = selectedVariant.min_pax || 1;
    const max = Math.min(selectedVariant.max_pax || 50, Math.max(seatLimit, min));

    const next = Math.min(Math.max(value, min), max);
    setNumberOfPax(next);
    setChildren((c) => Math.min(c, next));
    // Per-person extras can't exceed the guests.
    setChosen((current) =>
      Object.fromEntries(Object.entries(current).map(([id, qty]) => {
        const addon = details.addons.find((a) => a.id === id);
        return [id, addon?.unit === "per_person" ? Math.min(qty, next) : qty];
      })),
    );
  };

  // Submit booking
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const result = await createBooking({
        packageId,
        priceVariantId: selectedVariantId,
        tourDate,
        numberOfPax,
        contactName: contactName.trim(),
        contactEmail: contactEmail.trim(),
        contactPhone: contactPhone.trim(),
        specialRequests: specialRequests.trim() || undefined,
        numberOfChildren: childOption && children > 0 ? children : undefined,
        addons: Object.entries(chosen).filter(([, qty]) => qty > 0).map(([addonId, quantity]) => ({ addonId, quantity })),
      });

      if (!result.success) {
        setError(result.error || "We could not send your booking. Please try again.");
        setIsSubmitting(false);
        return;
      }

      // Success - redirect to booking confirmation
      router.push(`/tours/bookings/${result.bookingId}`);
    } catch {
      setError("We could not reach the server. Check your connection and try again. Nothing was booked.");
      setIsSubmitting(false);
    }
  }

  if (priceVariants.length === 0) {
    return (
      <div className="rounded-2xl bg-surface p-6 text-center">
        <p className="text-daet-ink/70">
          This package does not have pricing configured yet.
        </p>
      </div>
    );
  }

  const minPax = selectedVariant?.min_pax || 1;
  const maxPax = Math.min(selectedVariant?.max_pax || 50, Math.max(seatLimit, minPax));
  const notEnoughSeats = selectedDate !== undefined && selectedDate.seatsLeft < Math.max(numberOfPax, minPax);
  const noOpenDates = dateOptions !== null && dateOptions.every((option) => option.full);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div role="alert" className="rounded-2xl bg-red-50 dark:bg-red-950/40 p-4 text-sm text-red-800 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Tour Date */}
      <section className="rounded-2xl bg-surface p-6">
        <h2 className="text-xl font-bold text-daet-ink">Pick a date</h2>
        <p className="mt-1 text-sm text-daet-ink/70">Choose your preferred tour date</p>

        <div className="mt-4">
          <label htmlFor="tourDate" className="block text-sm font-bold text-daet-ink">
            Tour date *
          </label>
          {dateOptions === null ? (
            <>
              <input
                type="date"
                id="tourDate"
                value={tourDate}
                onChange={(e) => setTourDate(e.target.value)}
                min={getMinDate()}
                required
                className="mt-1 min-h-11 w-full rounded-2xl border border-daet-ink/20 px-4 py-2.5 text-base focus:border-daet-forest focus:outline-none focus:ring-2 focus:ring-daet-forest/20"
              />
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Earliest available: Tomorrow</p>
            </>
          ) : noOpenDates ? (
            <p className="mt-2 rounded-2xl bg-yellow-50 dark:bg-yellow-950/40 p-4 text-sm text-yellow-900 dark:text-yellow-200">
              There are no open dates with seats right now. Please check again later or contact the operator.
            </p>
          ) : (
            <>
              <select
                id="tourDate"
                value={tourDate}
                onChange={(e) => setTourDate(e.target.value)}
                required
                className="mt-1 min-h-11 w-full rounded-2xl border border-daet-ink/20 bg-surface px-4 py-2.5 text-base focus:border-daet-forest focus:outline-none focus:ring-2 focus:ring-daet-forest/20"
              >
                {dateOptions.map((option) => (
                  <option key={option.date} value={option.date} disabled={option.full}>
                    {formatOpenDate(option.date)} — {option.full ? "fully booked" : `${option.seatsLeft} seat${option.seatsLeft === 1 ? "" : "s"} left`}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Only dates the operator has opened are shown.</p>
            </>
          )}
        </div>
      </section>

      {/* Number of Pax & Price Variant */}
      <section className="rounded-2xl bg-surface p-6">
        <h2 className="text-xl font-bold text-daet-ink">Guests and price</h2>
        <p className="mt-1 text-sm text-daet-ink/70">Choose how many are coming</p>

        <div className="mt-4 space-y-4">
          {/* Price Variant Selection */}
          {priceVariants.length > 1 && (
            <div>
              <label htmlFor="variant" className="block text-sm font-bold text-daet-ink">
                Price option *
              </label>
              <select
                id="variant"
                value={selectedVariantId}
                onChange={(e) => setSelectedVariantId(e.target.value)}
                required
                className="mt-1 w-full rounded-2xl border border-daet-ink/20 min-h-11 px-4 py-2.5 text-base focus:border-daet-forest focus:outline-none focus:ring-2 focus:ring-daet-forest/20"
              >
                {priceVariants.map((variant) => (
                  <option key={variant.id} value={variant.id}>
                    {variant.variant_name} -{" "}
                    {variant.price_per_pax
                      ? `${formatPeso(variant.price_per_pax)}/person`
                      : formatPeso(variant.flat_price)}
                    {variant.flat_price && " (flat rate)"}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Pax Selection */}
          <div>
            <label htmlFor="pax" className="block text-sm font-bold text-daet-ink">
              Number of guests *
            </label>
            <div className="mt-1 flex items-center gap-3">
              <button
                type="button"
                onClick={() => handlePaxChange(numberOfPax - 1)}
                disabled={numberOfPax <= minPax}
                aria-label="One fewer participant"
                className="grid h-11 w-11 place-items-center rounded-full border border-daet-ink/20 text-lg font-bold text-daet-ink hover:bg-daet-sand disabled:opacity-30"
              >
                <span aria-hidden="true">−</span>
              </button>
              <input
                type="number"
                id="pax"
                value={numberOfPax}
                onChange={(e) => handlePaxChange(parseInt(e.target.value) || 1)}
                min={minPax}
                max={maxPax}
                required
                className="w-20 rounded-2xl border border-daet-ink/20 min-h-11 px-4 py-2.5 text-center text-base font-bold focus:border-daet-forest focus:outline-none focus:ring-2 focus:ring-daet-forest/20"
              />
              <button
                type="button"
                onClick={() => handlePaxChange(numberOfPax + 1)}
                disabled={numberOfPax >= maxPax}
                aria-label="One more participant"
                className="grid h-11 w-11 place-items-center rounded-full border border-daet-ink/20 text-lg font-bold text-daet-ink hover:bg-daet-sand disabled:opacity-30"
              >
                <span aria-hidden="true">+</span>
              </button>
              <span className="text-sm text-daet-ink/70">
                ({minPax} to {maxPax} guests)
              </span>
            </div>
            {notEnoughSeats ? (
              <p className="mt-2 text-sm font-semibold text-red-700 dark:text-red-300">
                Only {selectedDate?.seatsLeft} seat(s) left on this date. Choose another date or a smaller group.
              </p>
            ) : null}
            {rules && groupDealLabel(rules, formatPeso) ? <p className="mt-2 text-sm text-daet-ink/80">Group deal: {groupDealLabel(rules, formatPeso)}.</p> : null}
          </div>

          {childOption && rules ? (
            <div>
              <label htmlFor="children" className="block text-sm font-bold text-daet-ink">
                Of these, children aged {rules.child_max_age} and below
              </label>
              <select
                id="children"
                value={children}
                onChange={(e) => setChildren(Number(e.target.value))}
                className="mt-1 min-h-11 rounded-2xl border border-daet-ink/20 bg-surface px-4 text-base"
              >
                {Array.from({ length: numberOfPax + 1 }, (_, n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
              <p className="mt-1 text-sm text-daet-ink/70">{childPriceLabel(rules)}.</p>
            </div>
          ) : null}

          {bookableExtras.length ? (
            <fieldset>
              <legend className="text-sm font-bold text-daet-ink">Optional extras</legend>
              <ul className="mt-2 divide-y divide-daet-ink/10 rounded-2xl border border-daet-ink/15">
                {bookableExtras.map((addon) => {
                  const max = addonMax(addon.unit, numberOfPax);
                  const qty = chosen[addon.id] ?? 0;
                  const id = `extra-${addon.id}`;
                  return (
                    <li key={addon.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <label htmlFor={id} className="min-w-0">
                        <span className="block font-bold text-daet-ink">{addon.name}</span>
                        <span className="block text-sm text-daet-ink/75">
                          {formatPeso(addon.price)} {UNIT_LABEL[addon.unit]}
                          {addon.max_guests ? ` · up to ${addon.max_guests} guests` : ""}
                          {addon.needs_reservation ? " · the operator confirms it" : ""}
                        </span>
                      </label>
                      <select
                        id={id}
                        value={qty}
                        onChange={(e) => setChosen((c) => ({ ...c, [addon.id]: Number(e.target.value) }))}
                        className="min-h-11 shrink-0 rounded-2xl border border-daet-ink/20 bg-surface px-3 text-base"
                      >
                        <option value={0}>None</option>
                        {Array.from({ length: max }, (_, n) => n + 1).map((n) => (
                          <option key={n} value={n}>
                            {n}
                            {addon.unit === "per_night" ? (n === 1 ? " night" : " nights") : ""}
                          </option>
                        ))}
                      </select>
                    </li>
                  );
                })}
              </ul>
              {onSiteExtras.length ? (
                <p className="mt-2 text-sm text-daet-ink/70">
                  Paid on site: {onSiteExtras.map((a) => `${a.name} (${formatPeso(a.price)} ${UNIT_LABEL[a.unit]})`).join(", ")}.
                </p>
              ) : null}
            </fieldset>
          ) : null}

          {/* Price summary, line by line */}
          <div className="rounded-2xl bg-daet-sand/30 p-4">
            {quote && quote.lines.length > 1 ? (
              <dl className="mb-3 space-y-1 text-sm text-daet-ink">
                {quote.lines.map((line) => (
                  <div key={line.label} className="flex justify-between gap-3">
                    <dt>{line.label}</dt>
                    <dd className={`shrink-0 font-semibold tabular-nums ${line.amount < 0 ? "text-green-700 dark:text-green-300" : ""}`}>{line.amount < 0 ? `−${formatPeso(-line.amount)}` : formatPeso(line.amount)}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-bold text-daet-ink">Total</span>
              <span className="text-3xl font-bold text-daet-forest dark:text-blue-300">
                {formatPeso(totalAmount)}
              </span>
            </div>
            {quote && quote.lines.length === 1 && selectedVariant?.price_per_pax ? (
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                {formatPeso(selectedVariant.price_per_pax)} × {numberOfPax} guest{numberOfPax === 1 ? "" : "s"}
              </p>
            ) : null}
            {quote?.deposit ? (
              <p className="mt-2 text-sm text-daet-ink">
                Reservation fee {formatPeso(quote.deposit)}, taken off the total{details.depositRefundable ? "" : " and not refundable"}. You pay once the operator confirms.
              </p>
            ) : null}
          </div>
        </div>
      </section>

      {/* Contact Information */}
      <section className="rounded-2xl bg-surface p-6">
        <h2 className="text-xl font-bold text-daet-ink">Contact Information</h2>
        <p className="mt-1 text-sm text-daet-ink/70">
          We'll use this to confirm your booking
        </p>

        <div className="mt-4 space-y-4">
          <div>
            <label htmlFor="contactName" className="block text-sm font-bold text-daet-ink">
              Full Name *
            </label>
            <input
              type="text"
              id="contactName"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              required
              minLength={2}
              className="mt-1 w-full rounded-2xl border border-daet-ink/20 min-h-11 px-4 py-2.5 text-base focus:border-daet-forest focus:outline-none focus:ring-2 focus:ring-daet-forest/20"
              placeholder="Juan Dela Cruz"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="contactEmail" className="block text-sm font-bold text-daet-ink">
                Email Address *
              </label>
              <input
                type="email"
                id="contactEmail"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                required
                className="mt-1 w-full rounded-2xl border border-daet-ink/20 min-h-11 px-4 py-2.5 text-base focus:border-daet-forest focus:outline-none focus:ring-2 focus:ring-daet-forest/20"
                placeholder="juan@example.com"
              />
            </div>

            <div>
              <label htmlFor="contactPhone" className="block text-sm font-bold text-daet-ink">
                Phone Number *
              </label>
              <input
                type="tel"
                id="contactPhone"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                required
                minLength={10}
                className="mt-1 w-full rounded-2xl border border-daet-ink/20 min-h-11 px-4 py-2.5 text-base focus:border-daet-forest focus:outline-none focus:ring-2 focus:ring-daet-forest/20"
                placeholder="09123456789"
              />
            </div>
          </div>

          <div>
            <label htmlFor="specialRequests" className="block text-sm font-bold text-daet-ink">
              Special requests (optional)
            </label>
            <textarea
              id="specialRequests"
              value={specialRequests}
              onChange={(e) => setSpecialRequests(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-2xl border border-daet-ink/20 min-h-11 px-4 py-2.5 text-base focus:border-daet-forest focus:outline-none focus:ring-2 focus:ring-daet-forest/20"
              placeholder="Any dietary restrictions, accessibility needs, or special occasions..."
            />
          </div>
        </div>
      </section>

      {/* Submit */}
      <div className="flex flex-col gap-4 rounded-2xl bg-surface p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-bold text-daet-ink">Ready to book?</p>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Nothing is charged yet. You pay after the operator confirms.
          </p>
        </div>
        <button
          type="submit"
          disabled={isSubmitting || noOpenDates || notEnoughSeats || !tourDate}
          className="min-h-11 shrink-0 whitespace-nowrap rounded-full bg-daet-forest px-8 py-3 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-50"
        >
          {isSubmitting ? "Sending request..." : `Request booking · ${formatPeso(totalAmount)}`}
        </button>
      </div>
    </form>
  );
}
