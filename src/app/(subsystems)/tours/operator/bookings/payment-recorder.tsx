"use client";

import { useState } from "react";
import { recordPayment } from "./payment-actions";

interface PaymentRecorderProps {
  bookingId: string;
  bookingReference: string;
  totalAmount: number;
  totalPaid: number;
  paymentStatus: string;
}

export function PaymentRecorder({
  bookingId,
  bookingReference,
  totalAmount,
  totalPaid,
  paymentStatus,
}: PaymentRecorderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [notes, setNotes] = useState("");

  const remaining = totalAmount - totalPaid;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    const result = await recordPayment({
      bookingId,
      amount: parseFloat(amount),
      paymentMethod,
      referenceNumber: referenceNumber || null,
      paymentDate: new Date(paymentDate).toISOString(),
      notes: notes || null,
    });

    setIsSubmitting(false);

    if (result.success) {
      // Reset form
      setAmount("");
      setReferenceNumber("");
      setNotes("");
      setIsOpen(false);
      alert(`Payment recorded successfully! ${result.message || ""}`);
    } else {
      alert(`Error: ${result.error || "Failed to record payment"}`);
    }
  };

  const statusColors: Record<string, string> = {
    unpaid: "bg-red-100 text-red-800",
    partial: "bg-amber-100 text-amber-800",
    paid: "bg-emerald-100 text-emerald-800",
    refunded: "bg-gray-100 text-gray-800",
  };

  const statusLabels: Record<string, string> = {
    unpaid: "Unpaid",
    partial: "Partially Paid",
    paid: "Fully Paid",
    refunded: "Refunded",
  };

  return (
    <div className="rounded-2xl border border-daet-ink/10 bg-daet-sand/30 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-daet-ink/70">
            Payment Status
          </p>
          <span
            className={`mt-1 inline-block rounded-full px-3 py-1 text-xs font-bold ${
              statusColors[paymentStatus] || "bg-gray-100 text-gray-800"
            }`}
          >
            {statusLabels[paymentStatus] || paymentStatus}
          </span>
        </div>
        {paymentStatus !== "paid" && (
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="rounded-full bg-daet-forest px-4 py-2 text-sm font-bold text-white transition hover:bg-daet-ink"
          >
            {isOpen ? "Cancel" : "Record Payment"}
          </button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3 text-sm">
        <div>
          <p className="text-daet-ink/70">Total Amount</p>
          <p className="font-bold text-daet-ink">₱{totalAmount.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-daet-ink/70">Total Paid</p>
          <p className="font-bold text-emerald-700">₱{totalPaid.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-daet-ink/70">Remaining</p>
          <p className="font-bold text-amber-700">₱{remaining.toLocaleString()}</p>
        </div>
      </div>

      {isOpen && (
        <form onSubmit={handleSubmit} className="mt-4 space-y-3 border-t border-daet-ink/10 pt-4">
          <div>
            <label className="mb-1 block text-xs font-bold text-daet-ink">
              Payment Amount (₱) *
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              max={remaining}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              className="w-full rounded-xl border border-daet-ink/20 px-3 py-2 text-sm focus:border-daet-forest focus:outline-none"
              placeholder={`Max: ₱${remaining}`}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-daet-ink">
              Payment Method *
            </label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              required
              className="w-full rounded-xl border border-daet-ink/20 px-3 py-2 text-sm focus:border-daet-forest focus:outline-none"
            >
              <option value="cash">Cash</option>
              <option value="gcash">GCash</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="credit_card">Credit Card</option>
              <option value="debit_card">Debit Card</option>
              <option value="paypal">PayPal</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-daet-ink">
              Payment Date *
            </label>
            <input
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              required
              max={new Date().toISOString().split("T")[0]}
              className="w-full rounded-xl border border-daet-ink/20 px-3 py-2 text-sm focus:border-daet-forest focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-daet-ink">
              Reference Number
            </label>
            <input
              type="text"
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
              className="w-full rounded-xl border border-daet-ink/20 px-3 py-2 text-sm focus:border-daet-forest focus:outline-none"
              placeholder="Transaction ID, receipt no, etc."
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-daet-ink">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-xl border border-daet-ink/20 px-3 py-2 text-sm focus:border-daet-forest focus:outline-none"
              placeholder="Additional notes about this payment..."
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-full bg-daet-forest px-4 py-2 text-sm font-bold text-white transition hover:bg-daet-ink disabled:opacity-50"
          >
            {isSubmitting ? "Recording..." : "Record Payment"}
          </button>
        </form>
      )}
    </div>
  );
}
