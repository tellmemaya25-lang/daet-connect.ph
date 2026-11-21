import { expect, test } from "@playwright/test";
import { signInAs } from "./fixtures";

test.describe("admin events", () => {
  test.beforeEach(async ({ context }) => signInAs(context, "admin"));

  test("list groups Upcoming and Past and confirms delete in a dialog", async ({ page }, info) => {
    for (const width of [375, 1400]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/tours/admin/events");
      await expect(page.getByRole("heading", { name: /Upcoming/ })).toBeVisible();
      await page.screenshot({ path: `test-results/events-list-${width}.png`, fullPage: true });
    }
    await expect(page.getByRole("heading", { name: /Upcoming/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Past/ })).toBeVisible();
    const upcoming = page.getByRole("region", { name: /Upcoming/ });
    const past = page.getByRole("region", { name: /Past/ });
    await expect(upcoming.getByRole("paragraph").filter({ hasText: "Daet Pineapple Fair" })).toBeVisible();
    await expect(past.getByRole("paragraph").filter({ hasText: "Bagasbas Surf Weekend" })).toBeVisible();
    await expect(upcoming.getByRole("paragraph").filter({ hasText: "Bagasbas Surf Weekend" })).toHaveCount(0);

    await upcoming.getByRole("button", { name: /Delete/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("This cannot be undone");
    await expect(dialog.getByRole("button", { name: "Delete event" })).toBeVisible();
    await page.screenshot({ path: `test-results/events-list-dialog-${info.project.name}.png` });
  });

  test("new form suggests an end and rejects end before start", async ({ page }) => {
    for (const width of [375, 1400]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/tours/admin/events/new");
      await expect(page.getByLabel(/^Starts/)).toBeVisible();
      await page.screenshot({ path: `test-results/events-new-${width}.png`, fullPage: true });
    }
    await page.getByLabel(/^Event title/).fill("Test Fest");
    await page.getByLabel(/^Venue/).fill("Daet Plaza");
    await page.getByLabel(/^Starts/).fill("2027-01-10T09:00");
    await expect(page.getByLabel(/^Ends/)).toHaveValue("2027-01-10T12:00");
    await page.getByLabel(/^Ends/).fill("2027-01-10T08:00");
    await page.getByRole("button", { name: "Create event" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "End must be on or after the start." })).toBeVisible();
    await page.screenshot({ path: "test-results/events-new.png" });
  });
});
