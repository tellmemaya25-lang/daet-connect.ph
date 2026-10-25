"use client";

import { useState } from "react";
import { useFeedback } from "@/components/ui/feedback";
import { updatePaymentSettings } from "./actions";

interface PaymentSettingsFormProps {
  operatorId: string;
  gcashNumber?: string | null;
  gcashName?: string | null;
  bankName?: string | null;
  bankAccountNumber?: string | null;
  bankAccountName?: string | null;
  paymentInstructions?: string | null;
}

export function PaymentSettingsForm({
  operatorId,
  gcashNumber: initialGcash,
  gcashName: initialGcashName,
  bankName: initialBank,
  bankAccountNumber: initialBankAccount,
  bankAccountName: initialBankAccountName,
  paymentInstructions: initialInstructions,
}: PaymentSettingsFormProps) {
  const { toast, confirm } = useFeedback();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [gcashNumber, setGcashNumber] = useState(initialGcash || "");
  const [gcashName, setGcashName] = useState(initialGcashName || "");
  const [bankName, setBankName] = useState(initialBank || "");
  const [bankAccountNumber, setBankAccountNumber] = useState(initialBankAccount || "");
  const [bankAccountName, setBankAccountName] = useState(initialBankAccountName || "");
  const [paymentInstructions, setPaymentInstructions] = useState(
    initialInstructions || ""
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    const result = await updatePaymentSettings({
      operatorId,
      gcashNumber: gcashNumber || null,
      gcashName: gcashName || null,
      bankName: bankName || null,
      bankAccountNumber: bankAccountNumber || null,
      bankAccountName: bankAccountName || null,
      paymentInstructions: paymentInstructions || null,
    });

    setIsSubmitting(false);

    if (result.success) {
      toast("Payment settings saved.", "success");
    } else {
      toast(result.error || "We could not save your payment settings.", "error");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* GCash Details */}
      <div className="rounded-2xl border border-daet-ink/10 bg-daet-sand/20 p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-daet-ink">
          <span className="text-xl">📱</span>
          GCash Payment Details
        </h3>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-bold text-daet-ink">
              GCash Mobile Number
            </label>
            <input
              type="tel"
              value={gcashNumber}
              onChange={(e) => setGcashNumber(e.target.value)}
              className="w-full rounded-xl border border-daet-ink/20 px-3 py-2 text-sm focus:border-daet-forest focus:outline-none"
              placeholder="09171234567"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-daet-ink">
              GCash Account Name
            </label>
            <input
              type="text"
              value={gcashName}
              onChange={(e) => setGcashName(e.target.value)}
              className="w-full rounded-xl border border-daet-ink/20 px-3 py-2 text-sm focus:border-daet-forest focus:outline-none"
              placeholder="Juan Dela Cruz"
            />
          </div>
        </div>
      </div>

      {/* Bank Details */}
      <div className="rounded-2xl border border-daet-ink/10 bg-daet-sand/20 p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-daet-ink">
          <span className="text-xl">🏦</span>
          Bank Transfer Details
        </h3>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-bold text-daet-ink">Bank Name</label>
            <input
              type="text"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              className="w-full rounded-xl border border-daet-ink/20 px-3 py-2 text-sm focus:border-daet-forest focus:outline-none"
              placeholder="BPI, BDO, Metrobank, etc."
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-daet-ink">
              Account Number
            </label>
            <input
              type="text"
              value={bankAccountNumber}
              onChange={(e) => setBankAccountNumber(e.target.value)}
              className="w-full rounded-xl border border-daet-ink/20 px-3 py-2 text-sm focus:border-daet-forest focus:outline-none"
              placeholder="1234567890"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-daet-ink">
              Account Name
            </label>
            <input
              type="text"
              value={bankAccountName}
              onChange={(e) => setBankAccountName(e.target.value)}
              className="w-full rounded-xl border border-daet-ink/20 px-3 py-2 text-sm focus:border-daet-forest focus:outline-none"
              placeholder="Juan Dela Cruz"
            />
          </div>
        </div>
      </div>

      {/* Additional Instructions */}
      <div>
        <label className="mb-1 block text-sm font-bold text-daet-ink">
          Additional Payment Instructions (Optional)
        </label>
        <textarea
          value={paymentInstructions}
          onChange={(e) => setPaymentInstructions(e.target.value)}
          rows={4}
          className="w-full rounded-xl border border-daet-ink/20 px-3 py-2 text-sm focus:border-daet-forest focus:outline-none"
          placeholder="Example: Please include booking reference in payment message..."
        />
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-full bg-daet-forest px-6 py-3 font-bold text-white transition hover:bg-daet-ink disabled:opacity-50"
      >
        {isSubmitting ? "Saving..." : "Save Payment Settings"}
      </button>

      <p className="text-center text-xs text-daet-ink/70">
        These details will be shown to tourists after they book and confirm their tour.
      </p>
    </form>
  );
}
