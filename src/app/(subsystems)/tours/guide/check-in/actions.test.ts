import { checkInByScan, checkInManually } from "@/app/(subsystems)/tours/guide/check-in/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signQrToken, verifyUrl } from "@/lib/tours/qr-token";

jest.mock("server-only", () => ({}));
jest.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: jest.fn() }));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));

const mockCreateClient = createSupabaseServerClient as jest.MockedFunction<typeof createSupabaseServerClient>;
const SECRET = "unit-test-secret-with-at-least-thirty-two-chars";
const BOOKING = "9b7e5a5e-0000-4000-8000-000000000001";
const future = () => Math.floor(Date.now() / 1000) + 3600;

function client(rpcResult: { data: unknown; error: unknown }, user: unknown = { id: "guide-user" }) {
  const rpc = jest.fn().mockResolvedValue(rpcResult);
  mockCreateClient.mockResolvedValue({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user } }) },
    rpc,
  } as never);
  return rpc;
}

describe("checkInByScan", () => {
  const original = process.env.QR_SIGNING_SECRET;
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.QR_SIGNING_SECRET = SECRET;
  });
  afterAll(() => {
    process.env.QR_SIGNING_SECRET = original;
  });

  it("checks in a valid ticket scanned as a verify URL, and repeats are harmless", async () => {
    const token = signQrToken({ type: "booking", id: BOOKING, exp: future() }, SECRET);
    const rpc = client({ data: "checked_in", error: null });
    await expect(checkInByScan(verifyUrl("https://daet.example", token))).resolves.toMatchObject({ success: true, outcome: "checked_in", bookingId: BOOKING });
    expect(rpc).toHaveBeenCalledWith("tours_check_in", { p_booking_id: BOOKING, p_participant_id: null, p_method: "qr" });

    client({ data: "already", error: null });
    await expect(checkInByScan(token)).resolves.toMatchObject({ success: true, outcome: "already" });
  });

  it("rejects forged, expired and badge codes without touching the database", async () => {
    const rpc = client({ data: "checked_in", error: null });
    const forged = signQrToken({ type: "booking", id: BOOKING, exp: future() }, `${SECRET}-other`);
    const expired = signQrToken({ type: "booking", id: BOOKING, exp: Math.floor(Date.now() / 1000) - 1 }, SECRET);
    const badge = signQrToken({ type: "guide", id: BOOKING, exp: future() }, SECRET);

    expect((await checkInByScan(forged)).error).toMatch(/not valid/);
    expect((await checkInByScan(expired)).error).toMatch(/expired/);
    expect((await checkInByScan(badge)).error).toMatch(/guide badge/);
    expect((await checkInByScan("hello")).error).toMatch(/not a CONNECT-Daet ticket/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("shows the database's reason for wrong-day or wrong-guide scans", async () => {
    const token = signQrToken({ type: "booking", id: BOOKING, exp: future() }, SECRET);
    client({ data: null, error: { code: "42501", message: "Only the guide assigned to this tour can check guests in." } });
    expect((await checkInByScan(token)).error).toBe("Only the guide assigned to this tour can check guests in.");
    client({ data: null, error: { code: "23514", message: "Check-in opens on the tour date." } });
    expect((await checkInByScan(token)).error).toBe("Check-in opens on the tour date.");
  });

  it("refuses when the site has no signing secret", async () => {
    delete process.env.QR_SIGNING_SECRET;
    expect((await checkInByScan("CD1.booking.x")).error).toMatch(/not set up/);
  });
});

describe("checkInManually", () => {
  beforeEach(() => jest.clearAllMocks());

  it("checks in one guest or the whole group", async () => {
    const rpc = client({ data: "checked_in", error: null });
    const form = new FormData();
    form.set("bookingId", BOOKING);
    await checkInManually(form);
    expect(rpc).toHaveBeenLastCalledWith("tours_check_in", { p_booking_id: BOOKING, p_participant_id: null, p_method: "manual" });

    form.set("participantId", "11111111-2222-4333-8444-555555555555");
    await checkInManually(form);
    expect(rpc).toHaveBeenLastCalledWith("tours_check_in", expect.objectContaining({ p_participant_id: "11111111-2222-4333-8444-555555555555" }));
  });

  it("validates ids and requires a session", async () => {
    client({ data: "checked_in", error: null });
    const bad = new FormData();
    bad.set("bookingId", "nope");
    expect((await checkInManually(bad)).success).toBe(false);

    client({ data: "checked_in", error: null }, null);
    const form = new FormData();
    form.set("bookingId", BOOKING);
    expect((await checkInManually(form)).error).toMatch(/sign in/i);
  });
});
