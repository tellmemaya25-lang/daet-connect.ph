"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DateOption } from "@/lib/tours/availability";
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
}

const formatOpenDate = (dateKey: string) =>
  new Date(`${dateKey}T00:00:00Z`).toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export function BookingForm({ packageId, priceVariants, dateOptions, userProfile }: BookingFormProps) {
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

  // Get selected variant
  const selectedVariant = priceVariants.find((v) => v.id === selectedVariantId);

  // Calculate price
  const calculateTotal = () => {
    if (!selectedVariant) return 0;

    if (selectedVariant.price_per_pax) {
      return selectedVariant.price_per_pax * numberOfPax;
    }

    if (selectedVariant.flat_price) {
      return selectedVariant.flat_price;
    }

    return 0;
  };

  const totalAmount = calculateTotal();

  // Get min date (tomorrow)
  const getMinDate = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split("T")[0];
  };

  const selectedDate = dateOptions?.find((option) => option.date === tourDate);
  const seatLimit = selectedDate ? selectedDate.seatsLeft : Infinity;

  // Handle pax change with validation
  const handlePaxChange = (value: number) => {
    if (!selectedVariant) return;

    const min = selectedVariant.min_pax || 1;
    const max = Math.min(selectedVariant.max_pax || 50, Math.max(seatLimit, min));

    if (value < min) {
      setNumberOfPax(min);
    } else if (value > max) {
      setNumberOfPax(max);
    } else {
      setNumberOfPax(value);
    }
  };

  // Submit booking
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const result = await createBooking({
      packageId,
      priceVariantId: selectedVariantId,
      tourDate,
      numberOfPax,
      contactName: contactName.trim(),
      contactEmail: contactEmail.trim(),
      contactPhone: contactPhone.trim(),
      specialRequests: specialRequests.trim() || undefined,
    });

    if (!result.success) {
      setError(result.error || "Failed to create booking");
      setIsSubmitting(false);
      return;
    }

    // Success - redirect to booking confirmation
    router.push(`/tours/bookings/${result.bookingId}`);
  }

  if (priceVariants.length === 0) {
    return (
      <div className="rounded-3xl border border-daet-ink/10 bg-white p-6 text-center shadow-sm">
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
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Tour Date */}
      <section className="rounded-3xl border border-daet-ink/10 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-black text-daet-ink">Select Date</h2>
        <p className="mt-1 text-sm text-daet-ink/70">Choose your preferred tour date</p>

        <div className="mt-4">
          <label htmlFor="tourDate" className="block text-sm font-bold text-daet-ink">
            Tour Date *
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
                className="mt-1 min-h-11 w-full rounded-xl border border-daet-ink/20 px-4 py-2.5 text-base focus:border-daet-forest focus:outline-none focus:ring-2 focus:ring-daet-forest/20"
              />
              <p className="mt-1 text-xs text-daet-ink/70">Earliest available: Tomorrow</p>
            </>
          ) : noOpenDates ? (
            <p className="mt-2 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">
              There are no open dates with seats right now. Please check again later or contact the operator.
            </p>
          ) : (
            <>
              <select
                id="tourDate"
                value={tourDate}
                onChange={(e) => setTourDate(e.target.value)}
                required
                className="mt-1 min-h-11 w-full rounded-xl border border-daet-ink/20 bg-white px-4 py-2.5 text-base focus:border-daet-forest focus:outline-none focus:ring-2 focus:ring-daet-forest/20"
              >
                {dateOptions.map((option) => (
                  <option key={option.date} value={option.date} disabled={option.full}>
                    {formatOpenDate(option.date)} — {option.full ? "fully booked" : `${option.seatsLeft} seat${option.seatsLeft === 1 ? "" : "s"} left`}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-daet-ink/70">Only dates the operator has opened are shown.</p>
            </>
          )}
        </div>
      </section>

      {/* Number of Pax & Price Variant */}
      <section className="rounded-3xl border border-daet-ink/10 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-black text-daet-ink">Group Size & Pricing</h2>
        <p className="mt-1 text-sm text-daet-ink/70">Select number of participants</p>

        <div className="mt-4 space-y-4">
          {/* Price Variant Selection */}
          {priceVariants.length > 1 && (
            <div>
              <label htmlFor="variant" className="block text-sm font-bold text-daet-ink">
                Price Option *
              </label>
              <select
                id="variant"
                value={selectedVariantId}
                onChange={(e) => setSelectedVariantId(e.target.value)}
                required
                className="mt-1 w-full rounded-xl border border-daet-ink/20 px-4 py-2.5 text-sm focus:border-daet-forest focus:outline-none focus:ring-2 focus:ring-daet-forest/20"
              >
                {priceVariants.map((variant) => (
                  <option key={variant.id} value={variant.id}>
                    {variant.variant_name} - ₱
                    {variant.price_per_pax
                      ? `${variant.price_per_pax}/person`
                      : variant.flat_price?.toLocaleString()}
                    {variant.flat_price && " (flat rate)"}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Pax Selection */}
          <div>
            <label htmlFor="pax" className="block text-sm font-bold text-daet-ink">
              Number of Participants *
            </label>
            <div className="mt-1 flex items-center gap-3">
              <button
                type="button"
                onClick={() => handlePaxChange(numberOfPax - 1)}
                disabled={numberOfPax <= minPax}
                className="grid h-10 w-10 place-items-center rounded-full border border-daet-ink/20 text-lg font-bold text-daet-ink hover:bg-daet-sand disabled:opacity-30"
              >
                −
              </button>
              <input
                type="number"
                id="pax"
                value={numberOfPax}
                onChange={(e) => handlePaxChange(parseInt(e.target.value) || 1)}
                min={minPax}
                max={maxPax}
                required
                className="w-20 rounded-xl border border-daet-ink/20 px-4 py-2.5 text-center text-sm font-bold focus:border-daet-forest focus:outline-none focus:ring-2 focus:ring-daet-forest/20"
              />
              <button
                type="button"
                onClick={() => handlePaxChange(numberOfPax + 1)}
                disabled={numberOfPax >= maxPax}
                className="grid h-10 w-10 place-items-center rounded-full border border-daet-ink/20 text-lg font-bold text-daet-ink hover:bg-daet-sand disabled:opacity-30"
              >
                +
              </button>
              <span className="text-sm text-daet-ink/70">
                ({minPax} - {maxPax} pax)
              </span>
            </div>
            {notEnoughSeats ? (
              <p className="mt-2 text-sm font-semibold text-rose-700">
                Only {selectedDate?.seatsLeft} seat(s) left on this date. Choose another date or a smaller group.
              </p>
            ) : null}
          </div>

          {/* Price Summary */}
          <div className="rounded-2xl bg-daet-sand/30 p-4">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-bold text-daet-ink">Total Amount:</span>
              <span className="text-3xl font-black text-daet-forest">
                ₱{totalAmount.toLocaleString()}
              </span>
            </div>
            {selectedVariant?.price_per_pax && (
              <p className="mt-1 text-xs text-daet-ink/70">
                ₱{selectedVariant.price_per_pax.toLocaleString()} × {numberOfPax} pax
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Contact Information */}
      <section className="rounded-3xl border border-daet-ink/10 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-black text-daet-ink">Contact Information</h2>
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
              className="mt-1 w-full rounded-xl border border-daet-ink/20 px-4 py-2.5 text-sm focus:border-daet-forest focus:outline-none focus:ring-2 focus:ring-daet-forest/20"
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
                className="mt-1 w-full rounded-xl border border-daet-ink/20 px-4 py-2.5 text-sm focus:border-daet-forest focus:outline-none focus:ring-2 focus:ring-daet-forest/20"
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
                className="mt-1 w-full rounded-xl border border-daet-ink/20 px-4 py-2.5 text-sm focus:border-daet-forest focus:outline-none focus:ring-2 focus:ring-daet-forest/20"
                placeholder="09123456789"
              />
            </div>
          </div>

          <div>
            <label htmlFor="specialRequests" className="block text-sm font-bold text-daet-ink">
              Special Requests (Optional)
            </label>
            <textarea
              id="specialRequests"
              value={specialRequests}
              onChange={(e) => setSpecialRequests(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-xl border border-daet-ink/20 px-4 py-2.5 text-sm focus:border-daet-forest focus:outline-none focus:ring-2 focus:ring-daet-forest/20"
              placeholder="Any dietary restrictions, accessibility needs, or special occasions..."
            />
          </div>
        </div>
      </section>

      {/* Submit */}
      <div className="flex flex-col gap-4 rounded-3xl border border-daet-ink/10 bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-bold text-daet-ink">Ready to book?</p>
          <p className="text-xs text-daet-ink/70">
            Your booking will be pending until confirmed by the operator
          </p>
        </div>
        <button
          type="submit"
          disabled={isSubmitting || noOpenDates || notEnoughSeats || !tourDate}
          className="min-h-11 shrink-0 whitespace-nowrap rounded-full bg-daet-forest px-8 py-3 text-sm font-black text-white transition hover:bg-daet-ink disabled:opacity-50"
        >
          {isSubmitting ? "Submitting..." : `Book for ₱${totalAmount.toLocaleString()}`}
        </button>
      </div>
    </form>
  );
}
