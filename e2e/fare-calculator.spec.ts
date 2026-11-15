import { expect, test } from "@playwright/test";
import { checkA11y } from "./fixtures";

// Fare calculator (magkano ang pasundo?): fares only from the fare table.
test("a visitor works out what it costs to get from Manila to Bagasbas", async ({ page }) => {
  await page.goto("/tours/fares", { waitUntil: "networkidle" });
  await page.getByLabel("Pick me up at").selectOption("Manila (PITX)");
  await page.getByLabel("Take me to").selectOption("Bagasbas");
  await page.getByLabel("How many of you?").fill("2");
  await page.getByRole("button", { name: "Calculate" }).click();
  await expect(page).toHaveURL(/from=Manila/);
  const option = page.getByRole("article").first();
  await expect(option.getByText("Bus → Tricycle")).toBeVisible();
  await expect(option.getByText("₱1,662.00")).toBeVisible();
  await expect(option.getByText("₱831.00 each", { exact: false })).toBeVisible();
  await checkA11y(page, "fare calculator");

  await page.getByLabel("Round trip (there and back)").check();
  await page.getByRole("button", { name: "Calculate" }).click();
  await expect(page.getByRole("article").first().getByText("₱3,324.00")).toBeVisible();
});

test("a visitor prices a pickup to a tour's meeting point from the tour page", async ({ page }) => {
  await page.goto("/tours/packages/aa000000-0000-4000-8000-000000000001", { waitUntil: "networkidle" });
  await page.getByRole("link", { name: "How much to get picked up and brought there?" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Getting to the meeting point" })).toBeVisible();
  await page.getByLabel("Pick me up at").selectOption("Manila (PITX)");
  await page.getByRole("button", { name: "Calculate" }).click();
  await expect(page).toHaveURL(/package=aa000000/);
  await expect(page.getByRole("heading", { name: /\(meeting point\)/ })).toBeVisible();
  await expect(page.getByRole("article").first().getByText("Bus → Tricycle")).toBeVisible();
  await checkA11y(page, "meeting point fares");
});
