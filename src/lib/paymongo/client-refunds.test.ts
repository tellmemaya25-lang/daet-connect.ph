jest.mock("server-only", () => ({}));
import { listPaymentRefunds, type PaymongoConfig } from "./client";

const config: PaymongoConfig = { secretKey: "sk_test_dummy", webhookSecret: null, mode: "test", appUrl: "https://example.com", methods: [] };
const refund = (id: string) => ({ id, type: "refund", attributes: { amount: 100, payment_id: "pay_abc", status: "succeeded", reason: null } });

afterEach(() => jest.restoreAllMocks());

test("reads all pages of refunds for the requested payment", async () => {
  const fetchMock = jest.spyOn(global, "fetch")
    .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [refund("ref_first")], has_more: true }) } as Response)
    .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [refund("ref_second")], has_more: false }) } as Response);
  expect((await listPaymentRefunds(config, "pay_abc")).map((row) => row.id)).toEqual(["ref_first", "ref_second"]);
  const first = new URL(fetchMock.mock.calls[0][0] as string);
  const second = new URL(fetchMock.mock.calls[1][0] as string);
  expect(first.searchParams.get("data.attributes.payment_id")).toBe("pay_abc");
  expect(first.searchParams.get("data.attributes.limit")).toBe("100");
  expect(second.searchParams.get("data.attributes.after")).toBe("ref_first");
  expect(second.searchParams.has("after")).toBe(false);
  expect(first.searchParams.has("limit")).toBe(false);
});

test("refuses invalid or incomplete provider responses", async () => {
  jest.spyOn(global, "fetch").mockResolvedValue({ ok: true, json: async () => ({ data: [] }) } as Response);
  await expect(listPaymentRefunds(config, "pay_abc")).rejects.toThrow("Invalid PayMongo refund history");
  await expect(listPaymentRefunds(config, "bad-id")).rejects.toThrow("Invalid payment id");
});

test("rejects repeating pagination cursors rather than trusting an incomplete history", async () => {
  jest.spyOn(global, "fetch")
    .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [refund("ref_first")], has_more: true }) } as Response)
    .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [refund("ref_second")], has_more: true }) } as Response)
    .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [refund("ref_first")], has_more: true }) } as Response);
  await expect(listPaymentRefunds(config, "pay_abc")).rejects.toThrow("Invalid PayMongo refund pagination");
});
