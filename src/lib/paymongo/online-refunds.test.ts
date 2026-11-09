import {
  idempotencyKeyForRefund,
  ledgerRowsForRefundLines,
  refundedByPaymentFromLedger,
  refundLinesFromPaymongo,
  refundSequence,
  rpcRefundRows,
  sumRefundLines,
  type OnlinePaymentRow,
  type RefundLine,
} from "./online-refunds";
import type { RefundResource } from "./refunds";

const payment = (over: Partial<OnlinePaymentRow> = {}): OnlinePaymentRow => ({
  id: "ledger-payment-1",
  provider_ref: "pay_abc123",
  amount: 600,
  payment_method: "gcash",
  provider_method: "gcash",
  ...over,
});

const refund = (over: Partial<RefundResource["attributes"]> & { id?: string } = {}): RefundResource => ({
  id: over.id ?? "ref_abc123",
  type: "refund",
  attributes: {
    amount: 60000,
    status: "succeeded",
    payment_id: "pay_abc123",
    reason: "requested_by_customer",
    livemode: false,
    ...over,
  },
});

const line = (over: Partial<RefundLine> = {}): RefundLine => ({
  payment_id: "ledger-payment-1",
  provider_ref: "ref_abc123",
  amount: 600,
  original_payment_ref: "pay_abc123",
  ...over,
});

describe("refundLinesFromPaymongo", () => {
  it("finds a refund PayMongo sent but the ledger missed", () => {
    const lines = refundLinesFromPaymongo({
      refunds: [refund()],
      paymentRows: [payment()],
      knownRefs: new Set(),
      mode: "test",
    });
    expect(lines).toEqual([line()]);
  });

  it("ignores recorded, failed, duplicate and unrelated refunds", () => {
    const lines = refundLinesFromPaymongo({
      refunds: [
        refund({ id: "ref_recorded" }),
        refund({ id: "ref_failed", status: "failed" }),
        refund({ id: "ref_other", payment_id: "pay_other" }),
        refund({ id: "ref_duplicate" }),
        refund({ id: "ref_duplicate" }),
      ],
      paymentRows: [payment()],
      knownRefs: new Set(["ref_recorded"]),
      mode: "test",
    });
    expect(lines.map((row) => row.provider_ref)).toEqual(["ref_duplicate"]);
  });

  it("ignores live refunds when configured for the sandbox", () => {
    const lines = refundLinesFromPaymongo({
      refunds: [refund({ livemode: true })],
      paymentRows: [payment()],
      knownRefs: new Set(),
      mode: "test",
    });
    expect(lines).toEqual([]);
  });
});

describe("refundedByPaymentFromLedger", () => {
  it("reads the refund_of link from the newer schema", () => {
    const result = refundedByPaymentFromLedger(
      [{ refund_of: "ledger-payment-1", amount: 250, payment_status: "refunded" }],
      [payment()],
    );
    expect(result.get("ledger-payment-1")).toBe(250);
  });

  it("reads the raw_event link used by the no-migration fallback", () => {
    const result = refundedByPaymentFromLedger(
      [
        {
          amount: "350.00",
          payment_status: "refunded",
          raw_event: { source: "operator_online_refund", payment_id: "pay_abc123" },
        },
      ],
      [payment()],
    );
    expect(result.get("ledger-payment-1")).toBe(350);
  });

  it("ignores manual refunds that are not tied to an online payment", () => {
    const result = refundedByPaymentFromLedger([{ amount: 100, payment_status: "refunded" }], [payment()]);
    expect(result.size).toBe(0);
  });
});

describe("ledger fallback rows", () => {
  it("keeps PayMongo wallet names out of the constrained payment_method column", () => {
    const rows = ledgerRowsForRefundLines({
      lines: [line()],
      paymentRows: [payment({ payment_method: "other", provider_method: "paymaya" })],
      bookingId: "booking-1",
      userId: "user-1",
      now: "2026-11-09T00:00:00.000Z",
    });
    expect(rows[0]).toEqual(
      expect.objectContaining({
        provider: "paymongo",
        provider_ref: "ref_abc123",
        payment_status: "refunded",
        amount: 600,
        payment_method: "other",
        provider_method: "paymaya",
        raw_event: expect.objectContaining({ payment_id: "pay_abc123" }),
      }),
    );
  });

  it("uses only the three columns the RPC expects", () => {
    expect(rpcRefundRows([line()])).toEqual([
      { payment_id: "ledger-payment-1", provider_ref: "ref_abc123", amount: 600 },
    ]);
  });
});

describe("refund helpers", () => {
  it("makes a short, stable idempotency key", () => {
    const key = idempotencyKeyForRefund({
      bookingId: "booking-1",
      paymentId: "pay_abc123",
      sequence: 0,
      amountCentavos: 60000,
      reason: "requested_by_customer",
    });
    expect(key).toBe("refund:booking-1:pay_abc123:0:60000:requested_by_customer");
    expect(key.length).toBeLessThanOrEqual(255);
  });

  it("counts PayMongo's settled refunds for a payment", () => {
    expect(refundSequence([refund(), refund({ id: "ref_2", status: "failed" })], "pay_abc123", "test")).toBe(1);
  });

  it("sums refund lines in pesos", () => {
    expect(sumRefundLines([line({ amount: 100.5 }), line({ provider_ref: "ref_2", amount: 200.25 })])).toBe(300.75);
  });
});
