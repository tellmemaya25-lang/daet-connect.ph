import { expect, test } from "@playwright/test";
import { checkA11y, signInAs, visit } from "./fixtures";

// Kalmado Tour Services' Calaguas 2D1N (scripts/data/kalmado.json): itinerary,
// extras, group deal and reservation fee on the package page and the booking form.
const KPKG = "c1000000-0000-4000-8000-000000000001";

test.use({ viewport: { width: 375, height: 812 }, isMobile: true });

test("the package page shows price options, the day-by-day plan, extras and the operator's terms", async ({ page }) => {
  await visit(page, `/tours/packages/${KPKG}`, "Calaguas camping, 2 days 1 night");
  const options = page.getByRole("region", { name: "Price options" });
  await expect(options.getByText("From Minaogan port, Vinzons")).toBeVisible();
  await expect(options.getByText("With van from Manila and back")).toBeVisible();
  await expect(options.getByText(/16 or more guests: ₱200\.00 off per person and 1 goes free/).first()).toBeVisible();

  const plan = page.getByRole("region", { name: "Day by day" });
  await expect(plan.getByRole("heading", { name: "Day 1" })).toBeVisible();
  await expect(plan.getByRole("heading", { name: "Day 2" })).toBeVisible();
  await expect(plan.getByText(/Island hopping and snorkelling at Balagbag Island/)).toBeVisible();

  const extras = page.getByRole("region", { name: "Optional extras" });
  await expect(extras.getByText("Closed cabana")).toBeVisible();
  await expect(extras.getByText("₱4,500.00")).toBeVisible();
  await expect(extras.getByText(/On site/)).toBeVisible();

  await expect(page.getByRole("region", { name: "Good to know" }).getByText("Sunblock")).toBeVisible();
  await expect(page.getByRole("region", { name: "Reservation and cancellation" }).getByText(/₱500\.00 per person, taken off the total, not refundable/)).toBeVisible();
  await checkA11y(page, "trip details");
});

test("the booking form adds extras and applies the group deal to the total", async ({ context, page }) => {
  await signInAs(context, "tourist");
  await page.goto(`/tours/packages/${KPKG}/book`, { waitUntil: "networkidle" });
  const total = page.getByText("Total", { exact: true }).locator("xpath=..");
  await expect(total).toContainText("₱2,799.00");

  await page.getByLabel(/Closed cabana/).selectOption("1");
  await expect(total).toContainText("₱7,299.00");
  await expect(page.getByText(/Paid on site: Morning electricity/)).toBeVisible();
  await expect(page.getByText(/Reservation fee ₱500\.00, taken off the total and not refundable/)).toBeVisible();

  // 16 guests: one goes free and the other 15 get ₱200 off.
  await page.getByLabel("Number of guests *").fill("16");
  await expect(total).toContainText(`₱${(2799 * 15 - 200 * 15 + 4500).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`);
  await expect(page.getByText("Group deal: 1 free")).toBeVisible();
  await checkA11y(page, "booking with extras");
});
