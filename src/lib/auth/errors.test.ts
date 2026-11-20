import {
  emailCooldownSeconds,
  emailRateLimitMessage,
  isEmailRateLimited,
  signUpErrorMessage,
} from "@/lib/auth/errors";

// What Supabase Auth actually sends back for each of its limits.
const QUOTA = { status: 429, code: "over_email_send_rate_limit", message: "email rate limit exceeded" };
const COOLDOWN = {
  status: 429,
  code: "over_email_send_rate_limit",
  message: "For security purposes, you can only request this after 42 seconds.",
};
const REQUESTS = { status: 429, code: "over_request_rate_limit", message: "Request rate limit reached" };

describe("Supabase rate-limit errors", () => {
  it("recognises the email quota, the per-address cooldown, the request limit and a bare 429", () => {
    expect(isEmailRateLimited(QUOTA)).toBe(true);
    expect(isEmailRateLimited(COOLDOWN)).toBe(true);
    expect(isEmailRateLimited(REQUESTS)).toBe(true);
    expect(isEmailRateLimited({ status: 429, message: "" })).toBe(true);
    expect(isEmailRateLimited({ status: 422, code: "weak_password", message: "Password is too weak" })).toBe(false);
  });

  it("reads how long the per-address cooldown has left", () => {
    expect(emailCooldownSeconds(COOLDOWN)).toBe(42);
    expect(emailCooldownSeconds({ message: "you can only request this after 1 second" })).toBe(1);
    expect(emailCooldownSeconds(QUOTA)).toBeNull();
  });

  it("says when to try again, without blaming the visitor's address", () => {
    expect(emailRateLimitMessage(QUOTA, "a new link")).toMatch(/email limit for the hour.*about an hour/i);
    expect(emailRateLimitMessage(COOLDOWN, "a new link")).toMatch(/wait 42 seconds/i);
    expect(emailRateLimitMessage(REQUESTS, "a new link")).toMatch(/wait a few minutes/i);
    for (const error of [QUOTA, REQUESTS]) {
      expect(emailRateLimitMessage(error, "a new link")).not.toMatch(/that address|rate limit|429/i);
    }
  });

  it("explains a sign-up stopped by the email quota", () => {
    const message = signUpErrorMessage(QUOTA);
    expect(message).toMatch(/could not send your confirmation email/i);
    expect(message).toMatch(/try again in about an hour/i);
  });
});
