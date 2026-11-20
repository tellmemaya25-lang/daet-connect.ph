# Sign-up limits: why new accounts fail, and the dashboard fix

Written 2026-11-19. Visitors could not create accounts and saw a "too many
emails" error. The cause is in the Supabase project's settings, not in the app,
and only the project owner can fix it in the Supabase dashboard. Nothing here
changes the live project.

Sources: Supabase docs [Rate limits](https://supabase.com/docs/guides/auth/rate-limits),
[Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp) and
[CLI config](https://supabase.com/docs/guides/local-development/cli/config),
read 2026-11-19.

## 1. The likely cause

Every sign-up sends a confirmation email (*Confirm email* is ON, as
`docs/AUTH.md` §5 requires). With no custom SMTP configured, those emails go
through Supabase's built-in email service, which has three limits that a public
site cannot work with:

| Limit | Built-in service | Effect on Daet Connect |
|---|---|---|
| Emails sent by Auth | **2 per hour for the whole project** (not per address), "can change without notice" | The third sign-up, reset or resend in an hour fails with `over_email_send_rate_limit` / "email rate limit exceeded" (HTTP 429). |
| Recipients | **Only members of the project's team** | Any other address fails with "Email address not authorized" (or "Error sending confirmation email"). |
| Delivery | No SLA, intended for non-production use | Even messages that go out can be slow or land in spam. |

A second limit matters once email is fixed. **Sign-ups and sign-ins are limited
per IP address: 30 requests per 5 minutes** (`/auth/v1/signup`, `/recover`,
`/resend`, `/otp`, `/user`). Our sign-up, resend and reset run as Server Actions,
so Supabase sees the **Vercel server's IP**, not the visitor's. Everyone signing
up at the same time shares one bucket. That is fine for current traffic, but a
burst during an event or a school visit could hit it (`over_request_rate_limit`,
HTTP 429).

The app also has its own per-visitor limits (`src/lib/auth/rate-limit.ts`,
e.g. sign-up 10/hour per IP). Those use the visitor's real IP and are not the
problem.

## 2. What to do in the Supabase dashboard

Do these in order. Steps 1–2 fix the reported problem; 3–4 prevent the next one.

### Step 1: set up custom SMTP (required)

Use a transactional email provider. **Resend** is the simplest: it has a free
tier of 3,000 emails/month and 100/day. Brevo, SendGrid, Postmark and Amazon SES
also work.

1. Sign up at the provider and **verify a sending domain** you own (add the SPF,
   DKIM and, if offered, DMARC DNS records it shows you). A `*.vercel.app`
   address cannot be verified, so you need a real domain. A subdomain such as
   `mail.<your-domain>` is fine.
2. Create an SMTP credential / API key at the provider.
3. Supabase → your project → **Authentication → Emails → SMTP Settings**
   (`https://supabase.com/dashboard/project/<ref>/auth/smtp`) → *Enable custom
   SMTP*, and fill in:

   | Field | Resend value | SendGrid value |
   |---|---|---|
   | Sender email | `no-reply@<your verified domain>` | same |
   | Sender name | `CONNECT-DAET.ph` | same |
   | Host | `smtp.resend.com` | `smtp.sendgrid.net` |
   | Port | `465` (or `587`) | `587` |
   | Username | `resend` | `apikey` |
   | Password | your Resend API key | your SendGrid API key |

   The password lives only in the dashboard, never in this repo or `.env`.
4. Save. Supabase then lifts the "team members only" restriction.

### Step 2: raise the email rate limit

Turning on custom SMTP starts the email limit at **30 per hour**. Raise it to
match your provider's quota:

Supabase → **Authentication → Rate Limits**
(`https://supabase.com/dashboard/project/<ref>/auth/rate-limits`):

| Setting | Default | Suggested |
|---|---|---|
| Rate limit for sending emails | 30/hour (with custom SMTP) | **100/hour** (stays under Resend's free 100/day burst; raise if you pay for more) |
| Sign-ups and sign-ins (per IP, per 5 min) | 30 | **Keep 30 for now.** Raise to ~100 only if step 4 is not done and you expect bursts, because all our traffic comes from Vercel's IPs. |
| Token verifications (per IP, per 5 min) | 30 | keep |
| Token refreshes (per IP, per 5 min) | 150 | keep |

The app's own limits (`src/lib/auth/rate-limit.ts`) still stop a single
visitor from abusing the form, so raising Supabase's limits does not open the
door to spam.

### Step 3: keep email confirmation ON

**Authentication → Sign In / Providers → Email → Confirm email** must stay ON.
Turning it off would hide the problem but reopen finding #1 in `docs/AUTH.md`:
anyone could register someone else's address. The app also refuses to work with
it off (sign-up throws the session away and shows a misconfiguration message).
Google sign-in sends no email, so it keeps working whatever the mail limits are.
Point visitors to it while SMTP is being set up.

### Step 4 (optional, later): forward the visitor's IP

Supabase can rate-limit by the visitor's IP instead of Vercel's, but only for
requests that carry the `Sb-Forwarded-For` header **and use a secret API key**.
Publishable/anon keys are not accepted. That requires:

1. Authentication → Rate Limits → **IP Address Forwarding** → enable.
2. A code change: run the sign-up / resend / reset calls through a server-only
   client built with the secret key (`sb_secret_…`) and the header
   `sb-forwarded-for: <visitor IP>`.

This is not needed at current traffic. Do it only if step 2's per-IP limit is
ever hit. It is a security-sensitive change (a secret key in a request path), so
it should get its own PR and review.

## 3. Local development (`supabase/config.toml`)

The repo has no `supabase/config.toml`: migrations are applied by hand in the
SQL editor and E2E uses a mock Supabase. Nothing needs to change. If you ever run
`supabase start`, these are the relevant keys (local emails go to the built-in
mail catcher at `http://localhost:54324`, never to real inboxes):

```toml
[auth.email]
enable_signup = true
enable_confirmations = true   # match production; the default is false
max_frequency = "1m"

[auth.rate_limit]
email_sent = 30          # per hour; only applies when [auth.email.smtp] is enabled
sign_in_sign_ups = 30    # per 5 minutes per IP
token_verifications = 30
token_refresh = 150

# Leave [auth.email.smtp] disabled locally so mail stays in the local catcher.
```

## 4. How to verify

1. **SMTP works**: Authentication → Users → *Invite user* (or *Send magic link*)
   to an address that is **not** on your Supabase team, for example a fresh
   Gmail. It should arrive within a minute, from your sender name and domain.
   Check that it is not in spam. If it is, finish the provider's DKIM/DMARC setup.
2. **Sign-up works end to end**: on the live site, sign up with that address →
   "check your inbox" → open the link → you land signed in. Do it three times in
   a row with three addresses (Gmail `+tags` count as different addresses). The
   third one is what failed before.
3. **Logs**: Supabase → Logs → *Auth*. Filter for `429`,
   `over_email_send_rate_limit` and `not authorized`. There should be none after
   the change. Vercel runtime logs show `sign-up failed <code> <message>` for any
   sign-up the app could not complete.
4. **Confirmation still enforced**: sign in with the new account *before* opening
   the link. You should see "confirm your email" with a resend link, not a
   session.

## 5. What changed in the repo

- `src/lib/auth/errors.ts`: the sign-up error for Supabase's mail limits and
  for "Email address not authorized" no longer tells the visitor that *their
  address* got too much email. It says the site cannot send confirmation emails
  right now, which is the truth. The limit is project-wide.
- `src/lib/auth/errors.test.ts`: covers those three error shapes.
- This document. `docs/AUTH.md` §5 items 4 and 7 point to the same settings.
