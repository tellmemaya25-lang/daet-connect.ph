import { expect, test } from "@playwright/test";
import { checkA11y, signInAs } from "./fixtures";

// Admin reports and bans, the review watch list, revenue and the activity log
// (20261211). What each role may do is decided in the database (tested there).
test.describe("admin moderation", () => {
  test("the admin works the reports queue", async ({ context, page }) => {
    await signInAs(context, "admin");
    await page.goto("/tours/admin/reports", { waitUntil: "networkidle" });
    await expect(page.getByText("Worst trip ever, total scam.")).toBeVisible();
    await expect(page.getByText("2 open reports")).toBeVisible();
    await expect(page.getByRole("button", { name: "Hide review" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Ban 7 days for Rico Santos" })).toBeVisible();
    await checkA11y(page, "reports");
    await page.getByRole("button", { name: "Dismiss" }).first().click();
    await expect(page.getByText("Dismissed.")).toBeVisible();
  });

  test("the admin reads the activity log and filters it", async ({ context, page }) => {
    await signInAs(context, "admin");
    await page.goto("/tours/admin/activity", { waitUntil: "networkidle" });
    const table = page.getByRole("table", { name: "Activity, newest first" });
    await expect(table.getByText("changed a booking: status → confirmed")).toBeVisible();
    await expect(table.getByText("ban user: Spam reports")).toBeVisible();
    await checkA11y(page, "activity log");
    await page.getByLabel("What").selectOption("tours_bookings");
    await page.getByRole("button", { name: "Show" }).click();
    await expect(page).toHaveURL(/entity=tours_bookings/);
  });

  test("the admin sees the watch list and full revenue", async ({ context, page }) => {
    await signInAs(context, "admin");
    await page.goto("/tours/admin/reviews?show=watch", { waitUntil: "networkidle" });
    const ops = page.getByRole("region", { name: "Operators with low reviews (last 90 days)" });
    await expect(ops.getByText("3 low reviews", { exact: false })).toBeVisible();
    await expect(ops.getByRole("button", { name: "Ban Bagasbas Coast Tours" })).toBeVisible();
    await checkA11y(page, "review watch");

    await page.goto("/tours/admin/earnings", { waitUntil: "networkidle" });
    await expect(page.getByRole("region", { name: "Month by month" }).getByText(/Nov.*2026/)).toBeVisible();
    await expect(page.getByRole("region", { name: "Payment methods" }).getByText("GCash")).toBeVisible();
    await expect(page.getByText("20% of bookings cancelled")).toBeVisible();
    await checkA11y(page, "admin revenue");
  });

  test("a signed-in traveller reports a package", async ({ context, page }) => {
    await signInAs(context, "tourist");
    await page.goto("/tours/packages/aa000000-0000-4000-8000-000000000001", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Report this package to the Tourism Office" }).click();
    const form = page.getByRole("region", { name: "Report to the Tourism Office" });
    await form.getByLabel("What is wrong?").selectOption("scam");
    await form.getByRole("button", { name: "Send report" }).click();
    await expect(page.getByText("Thanks. The Tourism Office will look into it.")).toBeVisible();
  });
});
