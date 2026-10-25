import { expect, test, type Page } from "@playwright/test";
import { checkA11y, signInAs } from "./fixtures";

test.use({ viewport: { width: 375, height: 812 }, isMobile: true });

async function openAssistant(page: Page, path = "/tours/browse") {
  await page.goto(path, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Ask the assistant" }).click();
  const dialog = page.getByRole("dialog", { name: "Daet travel assistant" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test("visitors get policy answers in basic mode, and the dialog is accessible", async ({ page }) => {
  const dialog = await openAssistant(page);
  await expect(dialog.getByLabel("Ask the travel assistant")).toBeFocused();
  await dialog.getByLabel("Ask the travel assistant").fill("How do I cancel and get a refund?");
  await dialog.getByRole("button", { name: "Send" }).click();
  await expect(dialog.getByText(/48 hours/)).toBeVisible();
  await expect(dialog.getByText("Basic mode")).toBeVisible();
  await expect(dialog.getByRole("link", { name: "My bookings" })).toBeVisible();
  await checkA11y(page, "assistant dialog");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("visitors are asked to sign in for their bookings", async ({ page }) => {
  const dialog = await openAssistant(page);
  await dialog.getByRole("button", { name: "Where is my ticket?" }).click();
  await expect(dialog.getByText(/Sign in to see your bookings/).first()).toBeVisible();
});

test("a signed-in tourist sees their booking with ticket and booking links", async ({ context, page }) => {
  await signInAs(context, "tourist");
  const dialog = await openAssistant(page, "/tours/me");
  await dialog.getByRole("button", { name: "Where is my ticket?" }).click();
  await expect(dialog.getByText(/BK-20261023-7F3K2Q/).first()).toBeVisible();
  await expect(dialog.getByRole("link", { name: "Show ticket QR" }).first()).toBeVisible();
  await dialog.getByRole("link", { name: "View booking" }).first().click();
  await expect(page).toHaveURL(/\/tours\/bookings\//);
  await expect(dialog).toBeHidden();
});

test("asking for a person offers an editable message to send", async ({ context, page }) => {
  await signInAs(context, "tourist");
  const dialog = await openAssistant(page, "/tours/me");
  await dialog.getByLabel("Ask the travel assistant").fill("I want to talk to a person about my booking BK-20261023-7F3K2Q");
  await dialog.getByRole("button", { name: "Send" }).click();
  const message = dialog.getByLabel(/Message to/);
  await expect(message).toHaveValue(/talk to a person/);
  await expect(dialog.getByRole("button", { name: /Send to (operator|Tourism Office)/ })).toBeVisible();
  await checkA11y(page, "assistant handoff");
});

test("the help page hosts the same chat", async ({ page }) => {
  await page.goto("/tours/help", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { level: 1, name: "Daet travel assistant" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ask the assistant" })).toHaveCount(0);
  await page.getByLabel("Ask the travel assistant").fill("Can I pay with GCash?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText(/PayMongo/)).toBeVisible();
  await checkA11y(page, "help page");
});

test("the planner opens with the assistant's trip description filled in", async ({ page }) => {
  await page.goto(`/tours/plan?describe=${encodeURIComponent("2 days with my kids, beaches and food")}`, { waitUntil: "networkidle" });
  await expect(page.getByRole("textbox", { name: "Describe your trip" })).toHaveValue("2 days with my kids, beaches and food");
});
