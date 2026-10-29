import { expect, test } from "@playwright/test";
import { checkA11y } from "./fixtures";

test.use({ viewport: { width: 375, height: 812 }, isMobile: true });

test("describe a trip, plan it, then ask the assistant to change it", async ({ page }) => {
  await page.goto("/tours/plan", { waitUntil: "networkidle" });

  // 1. Plain words fill the form.
  await page.getByRole("textbox", { name: "Describe your trip" }).fill("3 days with my 2 kids, beaches and food, ₱300 each per day");
  await page.getByRole("button", { name: "Fill in the form" }).click();
  await expect(page.getByText(/Got it/)).toBeVisible();
  await expect(page.getByLabel("Days")).toHaveValue("3");
  await expect(page.getByLabel("People")).toHaveValue("3");
  await expect(page.getByRole("button", { name: /Food/ })).toHaveAttribute("aria-pressed", "true");
  await checkA11y(page, "planner with assistant");

  // 2. Plan, then edit through the assistant.
  await page.getByRole("button", { name: /plan my trip/i }).click();
  await expect(page.getByText(/Day 1/).first()).toBeVisible({ timeout: 30_000 });
  await checkA11y(page, "plan timeline");
  // Editing controls stay hidden until a stop is opened.
  await expect(page.getByRole("button", { name: /^Remove (?!the church)/ })).toHaveCount(0);
  await page.getByRole("button", { name: /^Edit / }).first().click();
  await expect(page.getByRole("button", { name: /^Remove (?!the church)/ })).toHaveCount(1);
  await checkA11y(page, "plan with a stop open for editing");
  await page.getByLabel("What should the assistant change?").fill("make it more relaxed and start at 9am");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.getByText(/days now run 9:00 AM/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Undo this change" })).toBeVisible();

  // 3. Something it can't follow gets an explanation, not a broken plan.
  await page.getByLabel("What should the assistant change?").fill("what's the weather like?");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.getByText(/didn't catch that/i)).toBeVisible();
  await checkA11y(page, "plan with assistant replies");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
