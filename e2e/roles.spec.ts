import { expect, test } from "@playwright/test";
import { signInAs, visit, type Role } from "./fixtures";

const pages: Record<Role, string[]> = {
  tourist: [
    "/tours/me",
    "/tours/my-bookings",
    "/tours/bookings/e9466de5-4877-47c1-ac14-d86deeb38b9e",
    "/tours/bookings/e9466de5-4877-47c1-ac14-d86deeb38b9e/ticket",
    "/tours/messages",
    "/tours/messages?kind=guide_tourist",
    "/tours/messages/cc110000-0000-4000-8000-000000000001",
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
    "/tours/operator/packages/create",
    "/tours/operator/settings",
    "/tours/messages",
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
    "/tours/admin/guides",
    "/tours/admin/packages",
    "/tours/messages",
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

test.describe("messaging channels", () => {
  test("tourist inbox filters by chat kind and opens a thread", async ({ context, page }) => {
    await signInAs(context, "tourist");
    await visit(page, "/tours/messages");
    const filters = page.getByRole("navigation", { name: "Filter conversations" });
    await filters.getByRole("link", { name: "Guide & tourist" }).click();
    await expect(page).toHaveURL(/kind=guide_tourist/);
    await expect(page.getByText("Maria Santos")).toBeVisible();
    await expect(page.getByText("Bagasbas Sunrise Surf Lesson")).toHaveCount(0);
  });

  test("thread labels the guide by name", async ({ context, page }) => {
    await signInAs(context, "tourist");
    await visit(page, "/tours/messages/cc110000-0000-4000-8000-000000000001");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText("Maria Santos", { exact: false }).first()).toBeVisible();
  });

  test("operator can contact the Tourism Office from the dashboard", async ({ context, page }) => {
    await signInAs(context, "operator");
    await visit(page, "/tours/operator/dashboard");
    await page.getByRole("button", { name: "Contact Tourism Office" }).click();
    await expect(page).toHaveURL(/\/tours\/messages\/cc110000-0000-4000-8000-000000000001$/);
  });

  test("admin can start a chat with an operator", async ({ context, page }) => {
    await signInAs(context, "admin");
    await visit(page, "/tours/messages");
    await page.getByText("Message an operator").click();
    await expect(page.getByRole("button", { name: "Message" }).first()).toBeVisible();
  });
});

test.describe("sign out", () => {
  for (const role of ["tourist", "operator", "guide", "admin"] as Role[]) {
    test(`${role} can find Sign out in the header at phone width`, async ({ context, page }) => {
      await signInAs(context, role);
      await page.goto(pages[role][0], { waitUntil: "networkidle" });
      await expect(page.getByRole("banner").getByRole("button", { name: "Sign out" })).toBeVisible();
    });
  }

  test("signing out returns to the home page", async ({ context, page }) => {
    await signInAs(context, "guide");
    await page.goto("/tours/guide/dashboard", { waitUntil: "networkidle" });
    await page.getByRole("banner").getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  const framed: Array<[Role, string]> = [
    ["admin", "/tours/admin/packages"],
    ["admin", "/tours/admin/packages/aa000000-0000-4000-8000-000000000001"],
    ["operator", "/tours/operator/packages/aa000000-0000-4000-8000-000000000001/edit"],
    ["guide", "/tours/no-such-page"],
  ];
  for (const [role, path] of framed) {
    test(`${role} has Sign out on ${path}`, async ({ context, page }) => {
      await signInAs(context, role);
      await page.goto(path, { waitUntil: "networkidle" });
      await expect(page.getByRole("banner").getByRole("button", { name: "Sign out" })).toBeVisible();
    });
  }

  test("signed-out visitors see Sign in instead", async ({ page }) => {
    await page.goto("/tours/attractions", { waitUntil: "networkidle" });
    await expect(page.getByRole("banner").getByRole("link", { name: "Sign in" })).toBeVisible();
    await expect(page.getByRole("banner").getByRole("button", { name: "Sign out" })).toHaveCount(0);
  });
});
