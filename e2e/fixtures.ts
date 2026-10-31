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
  const overflow = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth);
  expect(overflow, `${path} horizontal overflow`).toBeLessThanOrEqual(0);
  expect(await offScreen(page), `${path} content past the screen edge`).toEqual([]);
  await checkA11y(page, path);
  expect(errors, `${path} page errors`).toEqual([]);
}

/**
 * Text, buttons and images that stick out past the screen edge. Overflow the
 * page hides doesn't show in scrollWidth, but phones still clip or scroll it.
 * Content spilling out of its card counts too. Sideways scrollers (chip
 * rows) and fixed layers are left out.
 */
export async function offScreen(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const inScroller = (el: Element) => {
      for (let a = el.parentElement; a; a = a.parentElement) {
        const s = getComputedStyle(a);
        if (/(auto|scroll)/.test(s.overflowX) && a.scrollWidth > a.clientWidth) return true;
        if (s.position === "fixed") return true;
      }
      return false;
    };
    const found: string[] = [];
    for (const el of document.querySelectorAll("body *")) {
      if (el.closest("svg, .sr-only, [aria-hidden='true'], .maplibregl-map, figure")) continue;
      const tag = el.tagName.toLowerCase();
      const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent?.trim());
      if (!hasText && !["button", "a", "img", "input", "select", "textarea"].includes(tag)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || getComputedStyle(el).position === "fixed") continue;
      if (inScroller(el)) continue;
      const label = `${tag} "${(el.textContent ?? "").trim().slice(0, 30)}"`;
      if (r.right > vw + 1 || r.left < -1) found.push(`${label} [${Math.round(r.left)}..${Math.round(r.right)}]`);
      else {
        // Spilling out of its card (a rounded panel with a background) also counts.
        for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
          const s = getComputedStyle(a);
          if (parseFloat(s.borderTopLeftRadius) >= 12 && s.backgroundColor !== "rgba(0, 0, 0, 0)" && a.getBoundingClientRect().width > 200) {
            if (r.right > a.getBoundingClientRect().right + 1) found.push(`${label} past its card`);
            break;
          }
        }
      }
      if (found.length >= 5) break;
    }
    return found;
  });
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
