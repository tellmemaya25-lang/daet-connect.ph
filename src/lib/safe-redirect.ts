/**
 * Post-login redirect target from an untrusted `next` value: only same-site
 * paths ("/tours/me"), never another origin ("https://evil", "//evil",
 * "/\\evil"), so a crafted link cannot bounce a user off-site after sign-in.
 */
export function safeNextPath(value: unknown, fallback = "/"): string {
  if (typeof value !== "string") return fallback;
  const next = value.trim();
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f]/.test(next)) return fallback;
  try {
    const url = new URL(next, "http://same-site.invalid");
    if (url.origin !== "http://same-site.invalid") return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
