// Screenshots key pages at 1440 / 768 / 390 against the e2e mock (dev server on 3101).
// Usage: [THEME=dark] node scripts/design/shoot.mjs <outDir> [pathFilter]
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const out = process.argv[2] ?? ".taste-skill/shots";
const filter = process.argv[3] ?? "";
mkdirSync(out, { recursive: true });
const BASE = "http://localhost:3101";
const pages = [
  ["visitor", "/", "home"],
  ["visitor", "/tours/browse", "browse"],
  ["visitor", "/tours/packages/aa000000-0000-4000-8000-000000000001", "package"],
  ["visitor", "/tours/plan", "plan"],
  ["visitor", "/tours/attractions", "attractions"],
  ["visitor", "/tours/events", "events"],
  ["visitor", "/tours/merch", "merch"],
  ["visitor", "/login", "login"],
  ["visitor", "/tours/help", "help"],
  ["tourist", "/tours/me", "tourist-home"],
  ["tourist", "/tours/my-bookings", "my-bookings"],
  ["tourist", "/tours/bookings/e9466de5-4877-47c1-ac14-d86deeb38b9e", "booking"],
  ["tourist", "/tours/messages", "messages"],
  ["tourist", "/tours/messages/cc110000-0000-4000-8000-000000000001", "thread"],
  ["tourist", "/tours/notifications", "notifications"],
  ["tourist", "/tours/my-itineraries", "itineraries"],
  ["tourist", "/tours/messages/ai", "ai-chat"],
  ["operator", "/tours/operator/dashboard", "operator-home"],
  ["operator", "/tours/operator/bookings", "operator-bookings"],
  ["guide", "/tours/guide/dashboard", "guide-home"],
  ["admin", "/tours/admin", "admin-home"],
  ["operator", "/tours/operator/packages", "op-packages"],
  ["operator", "/tours/operator/payments", "op-payments"],
  ["operator", "/tours/operator/reviews", "op-reviews"],
  ["operator", "/tours/operator/settings", "op-settings"],
  ["guide", "/tours/guide/my-tours", "guide-tours"],
  ["guide", "/tours/guide/check-in", "guide-checkin"],
  ["admin", "/tours/admin/analytics", "admin-analytics"],
  ["admin", "/tours/admin/operators", "admin-operators"],
  ["admin", "/tours/admin/packages", "admin-packages"],
];
const session = (role) => ({ access_token: `e2e-${role}`, refresh_token: "e2e-refresh", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: "9b7e5a5e-0000-4000-8000-000000000001", aud: "authenticated", role: "authenticated", email: "juan@example.ph", app_metadata: {}, user_metadata: {} } });
const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
for (const [role, path, name] of pages.filter((p) => p[2].includes(filter))) {
  for (const width of [1440, 390]) {
    const ctx = await browser.newContext({ viewport: { width, height: width > 500 ? 900 : 844 }, deviceScaleFactor: 1, isMobile: width < 500, colorScheme: process.env.THEME === "dark" ? "dark" : "light" });
    if (role !== "visitor") await ctx.addCookies([{ name: "sb-127-auth-token", value: "base64-" + Buffer.from(JSON.stringify(session(role))).toString("base64url"), domain: "localhost", path: "/" }]);
    const page = await ctx.newPage();
    await page.goto(BASE + path, { waitUntil: "networkidle" }).catch(() => {});
    // Scroll through once so scroll-driven entrances have played, as they would for a reader.
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 400) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 40));
      }
      window.scrollTo(0, document.body.scrollHeight);
    });
    // Wait for lazy images to finish loading.
    await page.waitForFunction(() => Array.from(document.images).every((img) => img.complete), null, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${out}/${name}-${width}.png`, fullPage: true });
    await ctx.close();
  }
  console.log("shot", name);
}
await browser.close();
