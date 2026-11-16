jest.mock("server-only", () => ({}));
import { createRefund, listPaymentRefunds, type PaymongoConfig } from "./client";

const config: PaymongoConfig = { secretKey: "sk_test_dummy", webhookSecret: null, mode: "test", appUrl: "https://example.com", methods: [] };
const refund = (id: string) => ({ id, type: "refund", attributes: { amount: 100, payment_id: "pay_abc", status: "succeeded", reason: null } });
const payment = (refunds: unknown, id = "pay_abc") => ({ ok: true, json: async () => ({ data: { id, type: "payment", attributes: { refunds } } }) }) as Response;

afterEach(() => jest.restoreAllMocks());

test("reads refund history from the payment, never from a filtered refund list", async () => {
  const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue(payment([refund("ref_first"), refund("ref_second")]));
  expect((await listPaymentRefunds(config, "pay_abc")).map((row) => row.id)).toEqual(["ref_first", "ref_second"]);
  const url = new URL(fetchMock.mock.calls[0][0] as string);
  expect(url.pathname.endsWith("/payments/pay_abc")).toBe(true);
  expect(url.search).toBe("");
});

test("a payment with no refunds has an empty history", async () => {
  jest.spyOn(global, "fetch").mockResolvedValue(payment([]));
  await expect(listPaymentRefunds(config, "pay_abc")).resolves.toEqual([]);
});

test("fills in payment_id on nested refunds that omit it", async () => {
  jest.spyOn(global, "fetch").mockResolvedValue(payment([{ id: "ref_a", type: "refund", attributes: { amount: 100, status: "succeeded", reason: null } }]));
  const [row] = await listPaymentRefunds(config, "pay_abc");
  expect(row.attributes.payment_id).toBe("pay_abc");
});

test("refuses invalid or incomplete provider responses", async () => {
  jest.spyOn(global, "fetch").mockResolvedValue({ ok: true, json: async () => ({ data: { id: "pay_abc", attributes: {} } }) } as Response);
  await expect(listPaymentRefunds(config, "pay_abc")).rejects.toThrow("Invalid PayMongo refund history");
  jest.spyOn(global, "fetch").mockResolvedValue(payment([], "pay_other"));
  await expect(listPaymentRefunds(config, "pay_abc")).rejects.toThrow("Invalid PayMongo refund history");
  await expect(listPaymentRefunds(config, "bad-id")).rejects.toThrow("Invalid payment id");
});

test("a provider error never becomes an empty refund history", async () => {
  jest.spyOn(global, "fetch").mockResolvedValue({ ok: false, status: 400, json: async () => ({ errors: [{ code: "parameter_invalid", detail: "Invalid payment id" }] }) } as Response);
  await expect(listPaymentRefunds(config, "pay_abc")).rejects.toMatchObject({ status: 400 });
});

test("sends the persisted operation id as the idempotency key", async () => {
  const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue({ ok: true, json: async () => ({ data: refund("ref_new") }) } as Response);
  await createRefund(config, { paymentId: "pay_abc", amountCentavos: 100, reason: "others", idempotencyKey: "operation-123" });
  expect(fetchMock.mock.calls[0][1]?.headers).toEqual(expect.objectContaining({ "Idempotency-Key": "operation-123" }));
});
