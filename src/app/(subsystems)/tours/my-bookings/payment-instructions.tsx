interface PaymentInstructionsProps {
  operatorName: string;
  gcashNumber?: string | null;
  gcashName?: string | null;
  bankName?: string | null;
  bankAccountNumber?: string | null;
  bankAccountName?: string | null;
  paymentInstructions?: string | null;
  totalAmount: number;
  bookingReference: string;
  operatorPhone?: string | null;
}

export function PaymentInstructions({
  operatorName,
  gcashNumber,
  gcashName,
  bankName,
  bankAccountNumber,
  bankAccountName,
  paymentInstructions,
  totalAmount,
  bookingReference,
  operatorPhone,
}: PaymentInstructionsProps) {
  return (
    <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-2xl">💰</span>
        <h3 className="text-lg font-black text-amber-900">Payment Instructions</h3>
      </div>

      <div className="space-y-4">
        {/* Amount to Pay */}
        <div className="rounded-xl bg-white p-4 text-center">
          <p className="text-sm text-daet-ink/70">Total Amount to Pay</p>
          <p className="text-3xl font-black text-daet-forest">
            ₱{totalAmount.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-daet-ink/70">
            Reference: {bookingReference}
          </p>
        </div>

        {/* GCash Payment */}
        {gcashNumber && (
          <div className="rounded-xl bg-white p-4">
            <p className="mb-2 flex items-center gap-2 text-sm font-bold text-daet-ink">
              <span className="text-xl">📱</span>
              GCash Payment
            </p>
            <div className="space-y-2 text-sm">
              <div>
                <p className="text-daet-ink/70">GCash Number:</p>
                <p className="font-bold text-daet-ink">{gcashNumber}</p>
              </div>
              {gcashName && (
                <div>
                  <p className="text-daet-ink/70">Account Name:</p>
                  <p className="font-bold text-daet-ink">{gcashName}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Bank Transfer */}
        {bankName && bankAccountNumber && (
          <div className="rounded-xl bg-white p-4">
            <p className="mb-2 flex items-center gap-2 text-sm font-bold text-daet-ink">
              <span className="text-xl">🏦</span>
              Bank Transfer
            </p>
            <div className="space-y-2 text-sm">
              <div>
                <p className="text-daet-ink/70">Bank:</p>
                <p className="font-bold text-daet-ink">{bankName}</p>
              </div>
              <div>
                <p className="text-daet-ink/70">Account Number:</p>
                <p className="font-bold text-daet-ink">{bankAccountNumber}</p>
              </div>
              {bankAccountName && (
                <div>
                  <p className="text-daet-ink/70">Account Name:</p>
                  <p className="font-bold text-daet-ink">{bankAccountName}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Custom Instructions */}
        {paymentInstructions && (
          <div className="rounded-xl bg-white p-4">
            <p className="mb-2 flex items-center gap-2 text-sm font-bold text-daet-ink">
              <span className="text-xl">📝</span>
              Additional Instructions
            </p>
            <p className="whitespace-pre-wrap text-sm text-daet-ink/80">
              {paymentInstructions}
            </p>
          </div>
        )}

        {/* Contact Operator */}
        <div className="rounded-xl bg-daet-forest/10 p-4 text-center">
          <p className="text-xs text-daet-ink/70">
            After sending payment, contact the operator:
          </p>
          <p className="mt-2 font-bold text-daet-ink">
            {operatorName}
            {operatorPhone && (
              <>
                <br />
                <span className="text-sm">📞 {operatorPhone}</span>
              </>
            )}
          </p>
          <p className="mt-2 text-xs text-daet-ink/70">
            Send proof of payment (screenshot) to confirm your booking.
          </p>
        </div>

        {/* No Payment Details Warning */}
        {!gcashNumber && !bankName && (
          <div className="rounded-xl bg-rose-50 p-4 text-center">
            <p className="text-sm text-rose-800">
              ⚠️ Operator has not set up payment details yet.
              {operatorPhone && (
                <>
                  {" "}
                  Please contact them at <strong>{operatorPhone}</strong> for payment
                  instructions.
                </>
              )}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
