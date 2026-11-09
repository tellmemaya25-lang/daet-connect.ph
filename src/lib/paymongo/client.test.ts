jest.mock("server-only", () => ({}));

import { createRefund, listRefunds, type PaymongoConfig } from "./client";

const config: PaymongoConfig = {
  secretKey: "sk_test_example",
  webhookSecret: null,
  mode: "test",
  appUrl: "https://example.test",
  methods: ["gcash"],
};

const refund = {
  id: "ref_abc123",
  type: "refund" as const,
  attributes: {
    amount: 60000,
    status: "succeeded",
    payment_id: "pay_abc123",
    reason: "requested_by_customer",
    livemode: false,
  },
};

function mockResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

describe("PayMongo refund client", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("sends an idempotency key when creating a refund", async () => {
    const fetchMock = jest.fn().mockResolvedValue(mockResponse({ data: refund }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await createRefund(config, {
      paymentId: "pay_abc123",
      amountCentavos: 60000,
      reason: "requested_by_customer",
      idempotencyKey: "refund:booking:pay_abc123:0:60000:requested_by_customer",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.paymongo.com/v1/refunds",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Idempotency-Key": "refund:booking:pay_abc123:0:60000:requested_by_customer",
        }),
      }),
    );
  });

  it("lists existing refunds for the payment before sending new money", async () => {
    const fetchMock = jest.fn().mockResolvedValue(mockResponse({ has_more: false, data: [refund] }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await listRefunds(config, "pay_abc123");

    expect(result).toEqual([refund]);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("/v1/refunds?");
    expect(url).toContain("data.attributes.payment_id=pay_abc123");
    expect(url).toContain("data.attributes.limit=100");
  });

  it("refuses to treat a failed refund as sent", async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      mockResponse({ data: { ...refund, attributes: { ...refund.attributes, status: "failed" } } }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      createRefund(config, { paymentId: "pay_abc123", amountCentavos: 60000, reason: "requested_by_customer" }),
    ).rejects.toThrow(/did not accept the refund/);
  });
});
