import { expect, test } from "@playwright/test";
import { signInAs } from "./fixtures";

test.describe("admin accounts", () => {
  test.beforeEach(async ({ context }) => signInAs(context, "admin"));

  test("search field is full width on a phone and counts show the admin", async ({ page }) => {
    await page.goto("/tours/admin/accounts");
    await expect(page.getByText("1 admin")).toBeVisible();
    const box = await page.getByLabel("Name or email").boundingBox();
    expect(box!.width).toBeGreaterThan(280);
    await page.screenshot({ path: "test-results/accounts-375.png", fullPage: true });
  });

  test("no match offers to clear the filters", async ({ page }) => {
    await page.goto("/tours/admin/accounts?q=zzzz");
    await expect(page.getByText("No accounts match these filters")).toBeVisible();
    await page.getByRole("link", { name: "Clear filters" }).last().click();
    await expect(page).toHaveURL(/\/tours\/admin\/accounts$/);
    await expect(page.getByText("Maria Santos")).toBeVisible();
  });

  test("desktop layout", async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto("/tours/admin/accounts");
    await expect(page.getByText("Maria Santos")).toBeVisible();
    await page.screenshot({ path: "test-results/accounts-1400.png", fullPage: true });
  });
});
