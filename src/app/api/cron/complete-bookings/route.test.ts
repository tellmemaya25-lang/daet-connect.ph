const rpc = jest.fn();
jest.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ rpc }) }));

import { GET } from "./route";

const call = (auth?: string) =>
  GET(new Request("http://localhost/api/cron/complete-bookings", auth ? { headers: { authorization: auth } } : undefined));

describe("GET /api/cron/complete-bookings", () => {
  const original = process.env.CRON_SECRET;
  beforeEach(() => {
    rpc.mockReset();
    process.env.CRON_SECRET = "s3cret";
  });
  afterAll(() => {
    process.env.CRON_SECRET = original;
  });

  it("refuses when no secret is configured", async () => {
    delete process.env.CRON_SECRET;
    expect((await call("Bearer s3cret")).status).toBe(503);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses a wrong or missing bearer token", async () => {
    expect((await call()).status).toBe(401);
    expect((await call("Bearer nope")).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("runs the sweep and reports how many bookings it completed", async () => {
    rpc.mockResolvedValue({ data: 3, error: null });
    const response = await call("Bearer s3cret");
    expect(rpc).toHaveBeenCalledWith("tours_complete_past_bookings", { p_limit: 500 });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, completed: 3 });
  });

  it("returns 500 when the database refuses", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    jest.spyOn(console, "error").mockImplementation(() => {});
    expect((await call("Bearer s3cret")).status).toBe(500);
  });
});
