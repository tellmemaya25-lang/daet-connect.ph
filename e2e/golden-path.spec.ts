import { expect, test } from "@playwright/test";
import { checkA11y, signInAs } from "./fixtures";

/**
 * The evaluator walkthrough, screen by screen: plan → book → pay → check-in →
 * review → analytics. Payment and the webhook need PayMongo sandbox keys, so
 * those steps are covered by the manual script in docs/EVALUATION_KIT.md;
 * here we check every screen a tester touches works at phone width.
 */
test("tourist → guide → admin walkthrough screens", async ({ browser }) => {
  const tourist = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true });
  await signInAs(tourist, "tourist");
  const page = await tourist.newPage();

  // 1. Plan a trip and get a schedule.
  await page.goto("/tours/plan", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /plan my trip/i }).click();
  await expect(page.getByText(/Day 1/).first()).toBeVisible({ timeout: 30_000 });
  await checkA11y(page, "plan result");

  // 2. Open a package and reach the booking form with open dates.
  await page.goto("/tours/packages/aa000000-0000-4000-8000-000000000001", { waitUntil: "networkidle" });
  await page.getByRole("link", { name: /book this experience/i }).click();
  await expect(page).toHaveURL(/\/book$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await checkA11y(page, "booking form");

  // 3. Booking page: pay button and ticket for a confirmed booking.
  await page.goto("/tours/me", { waitUntil: "networkidle" });
  await expect(page.getByRole("link", { name: /show ticket qr/i }).first()).toBeVisible();
  await page.getByRole("link", { name: /^pay ₱/i }).first().click();
  await expect(page).toHaveURL(/#payment$/);
  await expect(page.getByRole("heading", { name: /pay for this tour/i })).toBeVisible();

  // 4. Completed tour: the review form is offered.
  await page.goto("/tours/bookings/b-done", { waitUntil: "networkidle" });
  await expect(page.getByText(/rate your tour/i)).toBeVisible();
  await page.getByRole("button", { name: "5 stars" }).click();
  await expect(page.getByRole("button", { name: /post review/i })).toBeEnabled();
  await checkA11y(page, "review form");
  await tourist.close();

  // 5. Guide: roster with the scanner shortcut.
  const guide = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true });
  await signInAs(guide, "guide");
  const guidePage = await guide.newPage();
  await guidePage.goto("/tours/guide/dashboard", { waitUntil: "networkidle" });
  await guidePage.getByRole("link", { name: /open roster/i }).first().click();
  await expect(guidePage).toHaveURL(/\/roster$/);
  await checkA11y(guidePage, "roster");
  await guide.close();

  // 6. Admin: analytics shows KPIs and the arrivals table.
  const admin = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true });
  await signInAs(admin, "admin");
  const adminPage = await admin.newPage();
  await adminPage.goto("/tours/admin/analytics", { waitUntil: "networkidle" });
  await expect(adminPage.getByText("Tourist check-ins")).toBeVisible();
  await adminPage.getByText("Show as table").click();
  await expect(adminPage.getByRole("table")).toBeVisible();
  await admin.close();
});

test("guide can mark a day available", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true });
  await signInAs(context, "guide");
  const page = await context.newPage();
  await page.goto("/tours/guide/dashboard", { waitUntil: "networkidle" });
  // Past days are disabled; pick the first future day that is not set yet.
  // Near the end of a month there may be none left, so look in next month.
  const notSet = page.locator('button[aria-label$=": not set"]:not([disabled])');
  if ((await notSet.count()) === 0) {
    await page.getByRole("link", { name: "Next month" }).click();
    await expect(notSet.first()).toBeVisible();
  }
  const day = notSet.first();
  const label = (await day.getAttribute("aria-label")) ?? "";
  await day.click();
  await expect(page.getByRole("button", { name: label.replace("not set", "available") })).toBeVisible();
  await context.close();
});
