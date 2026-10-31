import {
  buildCheckoutSessionBody,
  centavosToPesos,
  checkPayable,
  extractPaidPayments,
  ledgerPaymentMethod,
  parsePaymentMethods,
  pesosToCentavos,
  remainingBalance,
  sessionBookingId,
} from "@/lib/paymongo/checkout";

const BOOKING_ID = "e9466de5-4877-47c1-ac14-d86deeb38b9e";
const booking = {
  id: BOOKING_ID,
  booking_reference: "BK-20261023-ABC123",
  status: "confirmed",
  total_amount: "1398.00",
  total_paid: "20.00",
  payment_status: "partial",
};

describe("money conversion", () => {
  it("converts pesos and centavos without float drift", () => {
    expect(pesosToCentavos(1378)).toBe(137800);
    expect(pesosToCentavos(0.1 + 0.2)).toBe(30);
    expect(pesosToCentavos(19.99)).toBe(1999);
    expect(centavosToPesos(137800)).toBe(1378);
    expect(centavosToPesos(1999)).toBe(19.99);
  });

  it("computes the remaining balance from numeric strings", () => {
    expect(remainingBalance(booking)).toBe(1378);
    expect(remainingBalance({ total_amount: 100, total_paid: null })).toBe(100);
    expect(remainingBalance({ total_amount: 100, total_paid: 150 })).toBe(0);
  });
});

describe("checkPayable", () => {
  it("charges only the remaining balance of a confirmed booking", () => {
    expect(checkPayable(booking)).toEqual({ ok: true, amountPesos: 1378 });
  });

  it("refuses pending, cancelled, paid and refunded bookings", () => {
    expect(checkPayable({ ...booking, status: "pending" }).ok).toBe(false);
    expect(checkPayable({ ...booking, status: "cancelled" }).ok).toBe(false);
    expect(checkPayable({ ...booking, payment_status: "paid" }).ok).toBe(false);
    expect(checkPayable({ ...booking, payment_status: "refunded" }).ok).toBe(false);
    expect(checkPayable({ ...booking, total_paid: "1398.00" }).ok).toBe(false);
  });

  it("refuses balances below PayMongo's ₱20 minimum", () => {
    expect(checkPayable({ ...booking, total_paid: "1380.01" }).ok).toBe(false);
    expect(checkPayable({ ...booking, total_paid: "1378.00" })).toEqual({ ok: true, amountPesos: 20 });
  });
});

describe("buildCheckoutSessionBody", () => {
  const body = buildCheckoutSessionBody({
    booking,
    packageTitle: "Bagasbas Surf Lesson",
    amountPesos: 1378,
    appUrl: "https://daet.example.com/",
    methods: ["gcash", "card"],
    customer: { name: "Maya Santos", email: "maya@example.ph", phone: null },
  });

  it("charges the given amount in centavos as one PHP line item", () => {
    expect(body.data.attributes.line_items).toEqual([
      expect.objectContaining({ name: "Bagasbas Surf Lesson", amount: 137800, currency: "PHP", quantity: 1 }),
    ]);
  });

  it("links the session back to the booking", () => {
    expect(body.data.attributes.metadata).toEqual({ booking_id: BOOKING_ID });
    expect(body.data.attributes.reference_number).toBe("BK-20261023-ABC123");
    expect(body.data.attributes.success_url).toBe(`https://daet.example.com/tours/bookings/${BOOKING_ID}/paid`);
    expect(body.data.attributes.cancel_url).toBe(`https://daet.example.com/tours/bookings/${BOOKING_ID}?payment=cancelled`);
  });

  it("only sends known billing fields", () => {
    expect(body.data.attributes.billing).toEqual({ name: "Maya Santos", email: "maya@example.ph" });
    expect(body.data.attributes.payment_method_types).toEqual(["gcash", "card"]);
  });
});

describe("parsePaymentMethods", () => {
  it("parses a comma list and falls back to defaults", () => {
    expect(parsePaymentMethods(" GCash, card ,gcash")).toEqual(["gcash", "card"]);
    expect(parsePaymentMethods(undefined)).toEqual(["gcash", "paymaya", "card"]);
    expect(parsePaymentMethods(" , ")).toEqual(["gcash", "paymaya", "card"]);
  });
});

describe("extractPaidPayments", () => {
  const payment = (id: string, status: string, amount: number, type = "gcash") => ({
    id,
    type: "payment",
    attributes: { amount, status, paid_at: 1761213600, source: { type } },
  });

  it("reads paid payments from attributes.payments", () => {
    const session = {
      id: "cs_1",
      attributes: { payments: [payment("pay_1", "paid", 137800), payment("pay_2", "failed", 137800)] },
    };
    expect(extractPaidPayments(session)).toEqual([
      { id: "pay_1", amountCentavos: 137800, method: "gcash", paidAt: "2025-10-23T10:00:00.000Z" },
    ]);
  });

  it("falls back to the payment intent's payments", () => {
    const session = { attributes: { payments: [], payment_intent: { attributes: { payments: [payment("pay_9", "paid", 5000, "card")] } } } };
    expect(extractPaidPayments(session).map((p) => [p.id, p.method])).toEqual([["pay_9", "card"]]);
  });

  it("ignores duplicates and malformed entries", () => {
    const session = { attributes: { payments: [payment("pay_1", "paid", 100), payment("pay_1", "paid", 100), null, { id: 5 }, payment("pay_3", "paid", -1)] } };
    expect(extractPaidPayments(session).map((p) => p.id)).toEqual(["pay_1"]);
    expect(extractPaidPayments(null)).toEqual([]);
    expect(extractPaidPayments({})).toEqual([]);
  });
});

describe("sessionBookingId / ledgerPaymentMethod", () => {
  it("only accepts a UUID booking id from metadata", () => {
    expect(sessionBookingId({ attributes: { metadata: { booking_id: BOOKING_ID } } })).toBe(BOOKING_ID);
    expect(sessionBookingId({ attributes: { metadata: { booking_id: "1; drop table" } } })).toBeNull();
    expect(sessionBookingId({ attributes: {} })).toBeNull();
  });

  it("maps PayMongo methods onto ledger values", () => {
    expect(ledgerPaymentMethod("gcash")).toBe("gcash");
    expect(ledgerPaymentMethod("card")).toBe("credit_card");
    expect(ledgerPaymentMethod("paymaya")).toBe("other");
    expect(ledgerPaymentMethod(null)).toBe("other");
  });
});

describe("depositDue", () => {
  it("is what is left of the reservation fee, never above the total", () => {
    const { depositDue } = jest.requireActual("./checkout") as typeof import("./checkout");
    expect(depositDue({ deposit_amount: 1000, total_amount: 5598, total_paid: 0 })).toBe(1000);
    expect(depositDue({ deposit_amount: 1000, total_amount: 5598, total_paid: 400 })).toBe(600);
    expect(depositDue({ deposit_amount: 1000, total_amount: 5598, total_paid: 1000 })).toBe(0);
    expect(depositDue({ deposit_amount: 1000, total_amount: 300, total_paid: 0 })).toBe(300);
    expect(depositDue({ deposit_amount: null, total_amount: 300, total_paid: 0 })).toBe(0);
  });
});
