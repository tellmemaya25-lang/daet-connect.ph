jest.mock("server-only", () => ({}));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("@/lib/email/notify-booking", () => ({ emailBookingConfirmed: jest.fn(), emailGuideAssigned: jest.fn(), emailRefundSent: jest.fn() }));
jest.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: jest.fn() }));
jest.mock("@/lib/paymongo/client", () => ({
  getPaymongoConfig: jest.fn(() => ({ mode: "test" })), listPaymentRefunds: jest.fn(), createRefund: jest.fn(),
  PaymongoApiError: class PaymongoApiError extends Error {
    constructor(message: string, public status: number, public details: unknown) { super(message); }
  },
}));

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createRefund, listPaymentRefunds, PaymongoApiError } from "@/lib/paymongo/client";
import { getOnlineRefundAvailability, processRefund } from "./board-actions";

const bookingId = "410520f7-428e-4a5e-9f7c-e6c14a2399e5";
const payment = { id: "row1", provider_ref: "pay_abc", amount: 600 };
const providerRefund = { id: "ref_previous", type: "refund" as const, attributes: { amount: 60000, payment_id: "pay_abc", status: "succeeded", reason: null } };

function mockDatabase(status = "confirmed", ledgerError: { code: string; message: string } | null = null) {
  const update = jest.fn();
  const rpc = jest.fn(async (name: string) => ({ data: name === "tours_refundable_amount" ? 600 : 0, error: null }));
  const from = (table: string) => {
    let query = "";
    const builder = {
      select: (value: string) => { query = value; return builder; },
      eq: () => builder,
      in: () => builder,
      order: async () => ({ data: [payment], error: null }),
      update: (value: unknown) => { update(value); return builder; },
      maybeSingle: async () => ({ data: table === "tours_operators"
        ? { id: "op1", accreditation_status: "approved" }
        : { id: bookingId, status, tour_date: "2099-01-01", total_paid: 600, booking_reference: "BK-TEST", tours_packages: { operator_id: "op1" } }, error: null }),
      then: (resolve: (result: unknown) => void) => resolve({ data: query.includes("refund_of") ? [] : null, error: query.includes("refund_of") ? ledgerError : null }),
    };
    return builder;
  };
  jest.mocked(createSupabaseServerClient).mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: "user1" } } }) }, from, rpc } as never);
  return { update, rpc };
}

test("an unrecorded PayMongo refund blocks the refund before cancelling or sending money", async () => {
  const db = mockDatabase();
  jest.mocked(listPaymentRefunds).mockResolvedValue([providerRefund]);
  expect(await getOnlineRefundAvailability(bookingId)).toEqual(expect.objectContaining({ available: 0, error: expect.stringContaining("differs") }));
  const result = await processRefund({ bookingId, method: "paymongo", amount: 600, reason: "guest" });
  expect(result).toEqual(expect.objectContaining({ success: false, error: expect.stringContaining("differs") }));
  expect(db.update).not.toHaveBeenCalled();
  expect(createRefund).not.toHaveBeenCalled();
});

test("a full refund proceeds when the PayMongo history and ledger agree", async () => {
  const db = mockDatabase("cancelled");
  jest.mocked(listPaymentRefunds).mockResolvedValue([]);
  jest.mocked(createRefund).mockResolvedValue({ ...providerRefund, id: "ref_new" });
  expect(await getOnlineRefundAvailability(bookingId)).toEqual({ available: 600 });
  const result = await processRefund({ bookingId, method: "paymongo", amount: 600, reason: "guest" });
  expect(result.success).toBe(true);
  expect(createRefund).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ paymentId: "pay_abc", amountCentavos: 60000 }));
  expect(db.rpc).toHaveBeenCalledWith("tours_record_online_refund", expect.objectContaining({ p_booking_id: bookingId }));
});

test("a history lookup failure fails closed without sending a refund", async () => {
  const db = mockDatabase();
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.mocked(listPaymentRefunds).mockRejectedValue(new Error("offline"));
  const result = await processRefund({ bookingId, method: "paymongo", amount: 600 });
  expect(result).toEqual(expect.objectContaining({ success: false, error: expect.stringContaining("could not be verified") }));
  expect(db.update).not.toHaveBeenCalled();
  expect(createRefund).not.toHaveBeenCalled();
  jest.restoreAllMocks();
});

test("a missing refund column gives an actionable setup message and never sends money", async () => {
  const db = mockDatabase("confirmed", { code: "42703", message: "column tours_payments.refund_of does not exist" });
  const log = jest.spyOn(console, "error").mockImplementation(() => {});
  const availability = await getOnlineRefundAvailability(bookingId);
  expect(availability.error).toContain("apply the operator online refunds migration");
  const result = await processRefund({ bookingId, method: "paymongo", amount: 600 });
  expect(result.error).toContain("apply the operator online refunds migration");
  expect(db.update).not.toHaveBeenCalled();
  expect(listPaymentRefunds).not.toHaveBeenCalled();
  expect(createRefund).not.toHaveBeenCalled();
  log.mockRestore();
});

test.each([400, 401, 403, 404, 429, 500])("reports HTTP %s and does not send a refund when PayMongo cannot verify history", async (status) => {
  const db = mockDatabase();
  const log = jest.spyOn(console, "error").mockImplementation(() => {});
  jest.mocked(listPaymentRefunds).mockRejectedValue(new PaymongoApiError("provider detail", status, null));
  const result = await processRefund({ bookingId, method: "paymongo", amount: 600 });
  expect(result).toEqual(expect.objectContaining({ success: false, error: expect.stringContaining(`HTTP ${status}`) }));
  expect(db.update).not.toHaveBeenCalled();
  expect(createRefund).not.toHaveBeenCalled();
  log.mockRestore();
});


test("reports safe PayMongo validation identifiers without leaking arbitrary provider details", async () => {
  const db = mockDatabase();
  const log = jest.spyOn(console, "error").mockImplementation(() => {});
  jest.mocked(listPaymentRefunds).mockRejectedValue(new PaymongoApiError("private detail", 400, {
    errors: [{ code: "parameter_invalid", detail: "private detail", source: { pointer: "data.attributes.limit" } }],
  }));
  const result = await processRefund({ bookingId, method: "paymongo", amount: 600 });
  expect(result.error).toContain("code: parameter_invalid, field: data.attributes.limit");
  expect(result.error).not.toContain("private detail");
  expect(db.update).not.toHaveBeenCalled();
  expect(createRefund).not.toHaveBeenCalled();
  log.mockRestore();
});

test("does not expose untrusted error identifiers", async () => {
  mockDatabase();
  const log = jest.spyOn(console, "error").mockImplementation(() => {});
  jest.mocked(listPaymentRefunds).mockRejectedValue(new PaymongoApiError("private", 400, {
    errors: [{ code: "error with spaces secret", source: { pointer: "<private>" } }],
  }));
  const result = await getOnlineRefundAvailability(bookingId);
  expect(result.error).not.toContain("secret");
  expect(result.error).not.toContain("<private>");
  log.mockRestore();
});
