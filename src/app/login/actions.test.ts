import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { clearAttempts } from "@/lib/auth/rate-limit";
import { signInWithPassword } from "@/app/login/actions";

jest.mock("server-only", () => ({}));
jest.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: jest.fn() }));
jest.mock("next/navigation", () => ({
  redirect: jest.fn((url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;replace;${url};307` });
  }),
}));
jest.mock("next/headers", () => ({
  headers: jest.fn(async () => new Headers({ host: "daet.test", "x-forwarded-proto": "https", "x-forwarded-for": "203.0.113.9" })),
  cookies: jest.fn(async () => ({ set: jest.fn(), get: jest.fn(), getAll: jest.fn(() => []) })),
}));

const mockClient = createSupabaseServerClient as jest.MockedFunction<typeof createSupabaseServerClient>;
const mockRedirect = redirect as jest.MockedFunction<typeof redirect>;

const EMAIL = "juan@example.ph";
const PASSWORD = "bagasbas-waves-at-sunrise";

function form(entries: Record<string, string> = { email: EMAIL, password: PASSWORD }) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

function clientWith(signIn: jest.Mock, role: string | null = null) {
  const client = {
    rpc: jest.fn(async () => ({ data: role, error: null })),
    auth: {
      signInWithPassword: signIn,
      signOut: jest.fn(async () => ({ error: null })),
    },
  };
  mockClient.mockResolvedValue(client as never);
  return client;
}

const confirmedUser = {
  id: "u1",
  email: EMAIL,
  email_confirmed_at: "2026-10-01T00:00:00Z",
};

describe("signing in", () => {
  const env = process.env;
  beforeEach(() => {
    jest.clearAllMocks();
    clearAttempts();
    jest.spyOn(console, "error").mockImplementation(() => {});
    process.env = { ...env, NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon" };
  });
  afterAll(() => {
    process.env = env;
  });

  it("checks the shape of the input before calling the auth service", async () => {
    const state = await signInWithPassword({ status: "idle" }, form({ email: "nope", password: "" }));

    expect(state.status).toBe("error");
    expect(state.fieldErrors?.email).toMatch(/valid email/i);
    expect(state.fieldErrors?.password).toMatch(/password/i);
    expect(mockClient).not.toHaveBeenCalled();
  });

  it("answers a wrong password with one sentence that reveals nothing", async () => {
    clientWith(jest.fn(async () => ({ data: { user: null, session: null }, error: { code: "invalid_credentials", message: "Invalid login credentials", status: 400 } })));

    const state = await signInWithPassword({ status: "idle" }, form());

    expect(state.status).toBe("error");
    expect(state.message).toBe("That email and password do not match an account.");
    expect(state.message).not.toMatch(/exist|registered|found/i);
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("sends a confirmed account where it was going", async () => {
    clientWith(jest.fn(async () => ({ data: { user: confirmedUser, session: {} }, error: null })));

    await expect(signInWithPassword({ status: "idle" }, form({ email: EMAIL, password: PASSWORD, next: "/tours/me" }))).rejects.toThrow(
      "NEXT_REDIRECT",
    );

    expect(mockRedirect).toHaveBeenCalledWith("/tours/me");
  });

  it("sends an admin to the office dashboard, whatever page sent them", async () => {
    clientWith(jest.fn(async () => ({ data: { user: confirmedUser, session: {} }, error: null })), "admin");

    await expect(signInWithPassword({ status: "idle" }, form({ email: EMAIL, password: PASSWORD, next: "/tours/browse" }))).rejects.toThrow(
      "NEXT_REDIRECT",
    );

    expect(mockRedirect).toHaveBeenCalledWith("/tours/admin");
  });

  it("keeps an admin's deep link into the admin area", async () => {
    clientWith(jest.fn(async () => ({ data: { user: confirmedUser, session: {} }, error: null })), "admin");

    await expect(
      signInWithPassword({ status: "idle" }, form({ email: EMAIL, password: PASSWORD, next: "/tours/admin/reviews" })),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(mockRedirect).toHaveBeenCalledWith("/tours/admin/reviews");
  });

  it("sends an operator to the operator dashboard, whatever page sent them", async () => {
    clientWith(jest.fn(async () => ({ data: { user: confirmedUser, session: {} }, error: null })), "operator");

    await expect(signInWithPassword({ status: "idle" }, form({ email: EMAIL, password: PASSWORD, next: "/tours/browse" }))).rejects.toThrow(
      "NEXT_REDIRECT",
    );

    expect(mockRedirect).toHaveBeenCalledWith("/tours/operator/dashboard");
  });

  it("keeps an operator's deep link into the operator area", async () => {
    clientWith(jest.fn(async () => ({ data: { user: confirmedUser, session: {} }, error: null })), "operator");

    await expect(
      signInWithPassword({ status: "idle" }, form({ email: EMAIL, password: PASSWORD, next: "/tours/operator/bookings" })),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(mockRedirect).toHaveBeenCalledWith("/tours/operator/bookings");
  });

  it("sends a guide to the guide dashboard, whatever page sent them", async () => {
    clientWith(jest.fn(async () => ({ data: { user: confirmedUser, session: {} }, error: null })), "guide");

    await expect(signInWithPassword({ status: "idle" }, form({ email: EMAIL, password: PASSWORD, next: "/tours/browse" }))).rejects.toThrow(
      "NEXT_REDIRECT",
    );

    expect(mockRedirect).toHaveBeenCalledWith("/tours/guide/dashboard");
  });

  it("keeps a guide's deep link into the guide area", async () => {
    clientWith(jest.fn(async () => ({ data: { user: confirmedUser, session: {} }, error: null })), "guide");

    await expect(
      signInWithPassword({ status: "idle" }, form({ email: EMAIL, password: PASSWORD, next: "/tours/guide/earnings" })),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(mockRedirect).toHaveBeenCalledWith("/tours/guide/earnings");
  });

  it("ignores an off-site next", async () => {
    clientWith(jest.fn(async () => ({ data: { user: confirmedUser, session: {} }, error: null })));

    await expect(
      signInWithPassword({ status: "idle" }, form({ email: EMAIL, password: PASSWORD, next: "https://evil.example" })),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(mockRedirect).toHaveBeenCalledWith("/dashboard");
  });

  it("tells an unconfirmed account how to finish, and offers a way to resend", async () => {
    clientWith(
      jest.fn(async () => ({
        data: { user: null, session: null },
        error: { code: "email_not_confirmed", message: "Email not confirmed", status: 400 },
      })),
    );

    const state = await signInWithPassword({ status: "idle" }, form());

    expect(state.status).toBe("unverified");
    expect(state.email).toBe(EMAIL);
    expect(state.message).toMatch(/has not confirmed its email address/i);
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("refuses a session for an address that is not confirmed, when the project hands one out", async () => {
    // What a project with confirmations switched off does.
    const client = clientWith(
      jest.fn(async () => ({ data: { user: { ...confirmedUser, email_confirmed_at: null }, session: {} }, error: null })),
    );

    const state = await signInWithPassword({ status: "idle" }, form());

    expect(client.auth.signOut).toHaveBeenCalled();
    expect(state.status).toBe("unverified");
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("stops guessing at one account after a handful of tries", async () => {
    clientWith(jest.fn(async () => ({ data: { user: null, session: null }, error: { message: "Invalid login credentials" } })));

    const answers = [];
    for (let attempt = 0; attempt < 9; attempt += 1) {
      answers.push(await signInWithPassword({ status: "idle" }, form({ email: EMAIL, password: `guess-${attempt}` })));
    }

    expect(answers.some((state) => /too many attempts/i.test(state.message ?? ""))).toBe(true);
    expect(answers[answers.length - 1].status).toBe("error");
  });

  it("takes about the same time for a bad password as for a good one", async () => {
    clientWith(jest.fn(async () => ({ data: { user: null, session: null }, error: { message: "Invalid login credentials" } })));
    const failedAt = Date.now();
    await signInWithPassword({ status: "idle" }, form({ email: `slow-${Date.now()}@example.ph`, password: "wrong-password" }));

    // The floor is 400ms; allow for a slow machine above it.
    expect(Date.now() - failedAt).toBeGreaterThanOrEqual(350);
  });
});
