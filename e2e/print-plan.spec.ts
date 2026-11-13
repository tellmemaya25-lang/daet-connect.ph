import { expect, test } from "@playwright/test";
import { draftPlan, visit } from "./fixtures";

// Owner's list, item 1: the plan being drafted prints (or saves as PDF) on
// its own: one sheet with every day, without the chat, map or header.
test.use({ viewport: { width: 1440, height: 900 } });

test("Print / PDF in the planner prints only the plan sheet", async ({ page }) => {
  await visit(page, "/tours/plan", "Where to in Daet?");
  await draftPlan(page, "Plan 2 days of heritage, beaches and food");

  // Count the dialog instead of opening it.
  await page.evaluate(() => {
    (window as unknown as { printed: number }).printed = 0;
    window.print = () => {
      (window as unknown as { printed: number }).printed += 1;
    };
  });
  await page.getByRole("button", { name: "Print / PDF" }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(1);

  await page.emulateMedia({ media: "print" });
  const sheet = page.getByRole("article", { name: "Printable itinerary" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("heading", { name: /^Your \d-day Daet plan$/ })).toBeVisible();
  await expect(sheet.getByRole("heading", { name: /^Day 1/ })).toBeVisible();
  await expect(sheet.getByRole("heading", { name: /^Day 2/ })).toBeVisible();
  await expect(page.locator("#assistant-input")).toBeHidden();
  await expect(page.getByRole("button", { name: "Regenerate" })).toBeHidden();
  await page.screenshot({ path: "test-results/print-plan.png", fullPage: true });
});
