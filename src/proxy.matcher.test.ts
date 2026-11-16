import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { config } from "@/proxy";

/**
 * Where the session refresher runs. Pages and the auth routes: yes (the proxy
 * itself then leaves /auth/logout, /auth/callback and /auth/oauth alone so they
 * can end or replace the session). Polled API routes, other API routes (they
 * check and refresh the session themselves with getUser/getClaims), static
 * files, fonts and link prefetches: no, which keeps Fluid Active CPU low.
 */
const runs = (url: string, headers?: Record<string, string>) => unstable_doesMiddlewareMatch({ config, url, headers });

describe("proxy matcher", () => {
  it.each(["/", "/tours/me", "/tours/my-bookings", "/tours/admin/activity", "/login", "/auth/logout", "/auth/callback", "/tours/operator/payments/export"])("runs on %s", (url) => {
    expect(runs(url)).toBe(true);
  });

  it.each([
    "/api/live/summary",
    "/api/chat/11111111-1111-4111-8111-111111111111/messages",
    "/api/assistant",
    "/api/places/search",
    "/api/webhooks/paymongo",
    "/_next/static/chunks/app.js",
    "/_next/image",
    "/favicon.ico",
    "/sw.js",
    "/robots.txt",
    "/sitemap.xml",
    "/fonts/inter.woff2",
    "/images/bagasbas.webp",
  ])("skips %s", (url) => {
    expect(runs(url)).toBe(false);
  });

  it("skips link prefetches, which the real navigation refreshes", () => {
    expect(runs("/tours/me", { "next-router-prefetch": "1" })).toBe(false);
    expect(runs("/tours/me", { purpose: "prefetch" })).toBe(false);
  });
});
