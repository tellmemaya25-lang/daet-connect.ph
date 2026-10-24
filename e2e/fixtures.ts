import AxeBuilder from "@axe-core/playwright";
import { expect, type BrowserContext, type Page } from "@playwright/test";

export type Role = "tourist" | "operator" | "guide" | "admin";

/** Sign in by planting a Supabase session cookie; the mock maps the token to a role. */
export async function signInAs(context: BrowserContext, role: Role) {
  const session = {
    access_token: `e2e-${role}`,
    refresh_token: "e2e-refresh",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: "9b7e5a5e-0000-4000-8000-000000000001", aud: "authenticated", role: "authenticated", email: "juan@example.ph", app_metadata: {}, user_metadata: {} },
  };
  await context.addCookies([
    { name: "sb-127-auth-token", value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"), domain: "localhost", path: "/" },
  ]);
}

/**
 * Open a page and check it: loads OK, has a main heading, no horizontal
 * scroll at phone width, no serious/critical axe violations (WCAG 2.1 AA).
 */
export async function visit(page: Page, path: string, heading?: string | RegExp) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const response = await page.goto(path, { waitUntil: "networkidle" });
  expect(response?.status(), `${path} status`).toBeLessThan(400);
  if (heading) await expect(page.getByRole("heading", { level: 1 })).toContainText(heading);
  else await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", /^(en|fil|tl)/);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `${path} horizontal overflow`).toBeLessThanOrEqual(0);
  await checkA11y(page, path);
  expect(errors, `${path} page errors`).toEqual([]);
}

export async function checkA11y(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    // Next's dev-mode overlay button is not part of the app.
    .exclude("nextjs-portal")
    .analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const summary = serious.map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
  expect(summary, `${label} accessibility`).toEqual([]);
}
