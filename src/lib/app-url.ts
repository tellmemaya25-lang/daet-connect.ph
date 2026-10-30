/**
 * Public base URL of the site, used for payment return links, QR codes and
 * share links. NEXT_PUBLIC_APP_URL wins, except that a localhost value is
 * ignored on Vercel (it usually comes from copying .env.example) so payers
 * are never sent back to their own machine.
 */
type Env = Record<string, string | undefined>;

const LOCAL_HOST = /^(https?:\/\/)?(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?(\/|$)/i;

function withScheme(host: string): string {
  return /^https?:\/\//i.test(host) ? host : `https://${host}`;
}

function trimSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

export function resolveAppUrl(env: Env = process.env): string {
  const configured = env.NEXT_PUBLIC_APP_URL?.trim();
  const onVercel = Boolean(env.VERCEL || env.VERCEL_ENV);
  if (configured && !(onVercel && LOCAL_HOST.test(configured))) return trimSlash(configured);

  if (onVercel) {
    const production = env.VERCEL_ENV === "production" ? env.VERCEL_PROJECT_PRODUCTION_URL?.trim() : undefined;
    const host = production || env.VERCEL_URL?.trim();
    if (host) return trimSlash(withScheme(host));
  }
  return "http://localhost:3000";
}
