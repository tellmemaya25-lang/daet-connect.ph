// Mobile checks: horizontal overflow and tap targets under 44px, per page at 375px.
// Usage: node scripts/design/measure.mjs [pathFilter]
import { chromium } from "playwright";
const BASE = "http://localhost:3101";
const pages = [["visitor","/"],["visitor","/tours/browse"],["visitor","/tours/packages/aa000000-0000-4000-8000-000000000001"],["visitor","/tours/plan"],["visitor","/tours/attractions"],["visitor","/tours/events"],["visitor","/tours/merch"],["visitor","/login"],["tourist","/tours/me"],["tourist","/tours/my-bookings"],["operator","/tours/operator/dashboard"],["operator","/tours/operator/bookings"],["guide","/tours/guide/dashboard"],["admin","/tours/admin"]];
const session = (role) => ({ access_token: `e2e-${role}`, refresh_token: "r", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now()/1000)+3600, user: { id: "9b7e5a5e-0000-4000-8000-000000000001", aud: "authenticated", role: "authenticated", email: "juan@example.ph", app_metadata: {}, user_metadata: {} } });
const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
for (const [role, path] of pages.filter((p) => p[1].includes(process.argv[2] ?? ""))) {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  if (role !== "visitor") await ctx.addCookies([{ name: "sb-127-auth-token", value: "base64-" + Buffer.from(JSON.stringify(session(role))).toString("base64url"), domain: "localhost", path: "/" }]);
  const page = await ctx.newPage();
  await page.goto(BASE + path, { waitUntil: "networkidle" });
  const r = await page.evaluate(() => {
    const overflow = document.documentElement.scrollWidth - window.innerWidth;
    const small = [];
    for (const el of document.querySelectorAll("a, button, summary, select, input:not([type=hidden])")) {
      const b = el.getBoundingClientRect();
      if (!b.width || !b.height) continue;
      const inline = el.tagName === "A" && getComputedStyle(el).display === "inline";
      if (inline) continue; // links inside running text follow the text
      if (b.height < 44 || b.width < 44) small.push(`${el.tagName.toLowerCase()} "${(el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 30)}" ${Math.round(b.width)}x${Math.round(b.height)}`);
    }
    return { overflow, small: small.slice(0, 12), smallCount: small.length };
  });
  console.log(`${role} ${path}: overflow=${r.overflow} small=${r.smallCount}`, r.small.length ? "\n   " + r.small.join("\n   ") : "");
  await ctx.close();
}
await browser.close();
