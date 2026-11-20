import { isRecipientNotAuthorized, signUpErrorMessage } from "@/lib/auth/errors";

describe("signUpErrorMessage", () => {
  it("blames the site's mail limit, not the visitor's address, when Supabase stops sending", () => {
    const message = signUpErrorMessage({ code: "over_email_send_rate_limit", message: "email rate limit exceeded", status: 429 });
    expect(message).toMatch(/cannot send confirmation emails right now/i);
    expect(message).not.toMatch(/that address/i);
  });

  it("treats a per-IP request limit the same way", () => {
    expect(signUpErrorMessage({ code: "over_request_rate_limit", message: "Request rate limit reached", status: 429 })).toMatch(
      /cannot send confirmation emails/i,
    );
  });

  it("recognises the built-in mailer refusing a non-team address", () => {
    const error = { message: "Email address not authorized", status: 400 };
    expect(isRecipientNotAuthorized(error)).toBe(true);
    expect(signUpErrorMessage(error)).toMatch(/cannot send confirmation emails/i);
  });
});
