/**
 * Turning the auth service's words into ours.
 *
 * Two rules: never repeat a provider message that reveals whether an account
 * exists, and never show a raw internal error to a visitor. Anything we do not
 * recognise becomes one calm sentence, with the detail left in the server log.
 */

export type AuthErrorLike = { message?: string; code?: string; status?: number } | null;

function text(error: AuthErrorLike): string {
  return `${error?.code ?? ""} ${error?.message ?? ""}`.toLowerCase();
}

/** The address already has an account (Supabase says so in several ways). */
export function isAlreadyRegistered(error: AuthErrorLike): boolean {
  const value = text(error);
  return value.includes("already registered") || value.includes("user_already_exists") || value.includes("email_exists");
}

/** The account exists but has not clicked its confirmation link yet. */
export function isUnconfirmedEmail(error: AuthErrorLike): boolean {
  const value = text(error);
  return value.includes("email not confirmed") || value.includes("email_not_confirmed") || value.includes("not confirmed");
}

/**
 * Supabase refused because of a rate limit: its email quota, the per-address
 * cooldown between emails, or its per-IP request limit (HTTP 429).
 */
export function isEmailRateLimited(error: AuthErrorLike): boolean {
  const value = text(error);
  return (
    error?.status === 429 ||
    value.includes("over_email_send_rate_limit") ||
    value.includes("over_request_rate_limit") ||
    value.includes("rate limit") ||
    value.includes("too many requests") ||
    emailCooldownSeconds(error) !== null
  );
}

/**
 * Supabase waits a minute between two emails to the same address and says so:
 * "For security purposes, you can only request this after 42 seconds." The
 * number of seconds left, or null when the error is not that one.
 */
export function emailCooldownSeconds(error: AuthErrorLike): number | null {
  const match = /only request this after (\d+) seconds?/i.exec(error?.message ?? "");
  return match ? Math.max(1, Number(match[1])) : null;
}

/** The project-wide email quota ran out, as opposed to a request-rate limit. */
function isEmailQuota(error: AuthErrorLike): boolean {
  const value = text(error);
  return value.includes("over_email_send_rate_limit") || value.includes("email rate limit");
}

/**
 * What to tell a visitor when Supabase would not send an email. The quota is
 * shared by every visitor of the site, so the copy never blames their address,
 * and it says when trying again will work.
 */
export function emailRateLimitMessage(error: AuthErrorLike, sending: string): string {
  const cooldown = emailCooldownSeconds(error);
  if (cooldown !== null) {
    return `We just sent ${sending} to that address. Please wait ${cooldown} second${cooldown === 1 ? "" : "s"}, then try again if it has not arrived.`;
  }
  if (isEmailQuota(error)) {
    return `We could not send ${sending}: Daet Connect has reached its email limit for the hour. Nothing is wrong with your details. Please try again in about an hour.`;
  }
  return "We are getting a lot of requests right now. Please wait a few minutes, then try again.";
}

export const GENERIC_SIGN_IN = "That email and password do not match an account.";

export function signUpErrorMessage(error: AuthErrorLike): string {
  if (isEmailRateLimited(error)) {
    return emailRateLimitMessage(error, "your confirmation email");
  }
  const value = text(error);
  if (value.includes("password")) return "That password was not accepted. Choose a longer one, or one that is not common.";
  if (value.includes("email") && value.includes("invalid")) return "That email address was not accepted. Check it and try again.";
  if (value.includes("signups not allowed") || value.includes("signup") && value.includes("disabled")) {
    return "Sign-ups are closed right now. Please contact the Daet Tourism Office.";
  }
  return "We could not create the account just now. Please try again in a moment.";
}
