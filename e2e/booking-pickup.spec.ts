import { expect, test } from "@playwright/test";
import { signInAs } from "./fixtures";

// Owner's list, item 5: the booking price includes the pickup the tourist picks.
test.use({ viewport: { width: 1280, height: 900 } });

const BOOK = "/tours/packages/aa000000-0000-4000-8000-000000000001/book";
const pesos = (text: string | null) => Number((text ?? "").replace(/[^\d.]/g, ""));

test("choosing a pickup adds its fee to the total", async ({ context, page }) => {
  await signInAs(context, "tourist");
  await page.goto(BOOK, { waitUntil: "networkidle" });

  const summary = page.locator("dl").filter({ hasText: "Pickup" });
  await expect(page.getByLabel("Pickup location")).toBeVisible();
  await expect(summary.getByText("Free")).toBeVisible();
  const total = page.getByText("Total", { exact: true }).locator("xpath=following-sibling::span");
  const before = pesos(await total.textContent());

  await page.getByLabel("Pickup location").selectOption({ label: "Mercedes port · ₱300.00 per booking" });
  await expect(summary.getByText("(Mercedes port)")).toBeVisible();
  await expect.poll(async () => pesos(await total.textContent())).toBe(before + 300);
});
