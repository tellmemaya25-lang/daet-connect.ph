import { expect, test } from "@playwright/test";
import { checkA11y, signInAs } from "./fixtures";

test.describe("guide hours and revenue", () => {
  test("a guide sets the hours they can work on a day", async ({ context, page }) => {
    await signInAs(context, "guide");
    await page.goto("/tours/guide/dashboard", { waitUntil: "networkidle" });
    // A day with hours shows them on the calendar.
    await expect(page.locator('button[aria-label*="8:00 AM – 12:00 PM"]')).toBeVisible();
    await page.getByRole("radio", { name: "Set hours" }).click();
    await page.locator('button[aria-label*="available"]:not([disabled])').first().click();
    const editor = page.getByRole("region", { name: "Hours for the day" });
    await editor.getByLabel("From").fill("09:00");
    await editor.getByLabel("Until").fill("13:30");
    await checkA11y(page, "guide hours editor");
    await editor.getByRole("button", { name: "Save hours" }).click();
    await expect(page.getByRole("status").filter({ hasText: "9:00 AM – 1:30 PM" })).toBeVisible();
  });

  test("a guide tracks revenue: paid, owed, by operator and by month", async ({ context, page }) => {
    await signInAs(context, "guide");
    await page.goto("/tours/guide/earnings", { waitUntil: "networkidle" });
    await expect(page.getByText("Still owed", { exact: true })).toBeVisible();
    const byOperator = page.getByRole("region", { name: "By operator" });
    await expect(byOperator.getByText("Bagasbas Coast Tours")).toBeVisible();
    await expect(byOperator.getByText(/30% share/)).toBeVisible();
    await expect(page.getByRole("region", { name: "By month" }).getByText(/Nov.*2026/)).toBeVisible();
    await checkA11y(page, "guide revenue");
  });

  test("an operator sees guide fees to pay", async ({ context, page }) => {
    await signInAs(context, "operator");
    await page.goto("/tours/operator/earnings", { waitUntil: "networkidle" });
    await expect(page.getByRole("region", { name: "Guide fees" })).toBeVisible();
    await checkA11y(page, "operator guide fees");
  });
});
