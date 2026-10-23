import { expect, test } from "@playwright/test";
import { signInAs, visit, type Role } from "./fixtures";

const pages: Record<Role, string[]> = {
  tourist: [
    "/tours/me",
    "/tours/my-bookings",
    "/tours/bookings/e9466de5-4877-47c1-ac14-d86deeb38b9e",
    "/tours/bookings/e9466de5-4877-47c1-ac14-d86deeb38b9e/ticket",
    "/tours/messages",
    "/tours/notifications",
    "/tours/my-itineraries",
  ],
  operator: [
    "/tours/operator/dashboard",
    "/tours/operator/bookings",
    "/tours/operator/payments",
    "/tours/operator/reviews",
    "/tours/operator/merch",
    "/tours/operator/merch/new",
    "/tours/operator/packages",
  ],
  guide: ["/tours/guide/dashboard", "/tours/guide/my-tours", "/tours/guide/check-in", "/tours/guide/my-qr", "/tours/guide/tours/e9466de5-4877-47c1-ac14-d86deeb38b9e/roster"],
  admin: [
    "/tours/admin",
    "/tours/admin/analytics",
    "/tours/admin/reviews",
    "/tours/admin/merch",
    "/tours/admin/events",
    "/tours/admin/attractions",
    "/tours/admin/operators",
  ],
};

for (const role of Object.keys(pages) as Role[]) {
  test.describe(`${role} pages`, () => {
    test.beforeEach(async ({ context }) => signInAs(context, role));
    for (const path of pages[role]) {
      test(`renders ${path}`, async ({ page }) => {
        await visit(page, path);
      });
    }
    test("bottom tab bar leads to every dashboard section", async ({ page }) => {
      await page.goto(pages[role][0], { waitUntil: "networkidle" });
      const tabs = page.getByRole("navigation", { name: "Dashboard" }).getByRole("link");
      await expect(tabs).toHaveCount(5);
      await expect(tabs.first()).toHaveAttribute("aria-current", "page");
    });
  });
}

test("/dashboard sends each role home", async ({ browser }) => {
  const homes: Record<Role, RegExp> = {
    tourist: /\/tours\/me$/,
    operator: /\/tours\/operator\/dashboard$/,
    guide: /\/tours\/(operator|guide)\/dashboard$/,
    admin: /\/tours\/admin$/,
  };
  for (const role of Object.keys(homes) as Role[]) {
    const context = await browser.newContext();
    await signInAs(context, role);
    const page = await context.newPage();
    await page.goto("/dashboard");
    await expect(page).toHaveURL(homes[role]);
    await context.close();
  }
});
