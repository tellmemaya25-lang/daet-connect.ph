import { expect, test } from "@playwright/test";
import { offScreen, signInAs, visit } from "./fixtures";

// The narrowest common phone. Cards with tour photos used to spill past the
// screen here, and the notifications panel opened off the left edge.
test.use({ viewport: { width: 360, height: 780 } });

test.describe("mobile layout at 360px", () => {
  test("guide My tours and Home keep cards inside the screen", async ({ context, page }) => {
    await signInAs(context, "guide");
    await visit(page, "/tours/guide/my-tours", "My tours");
    await expect(page.getByRole("link", { name: "Live map" }).first()).toBeVisible();
    await visit(page, "/tours/guide/dashboard");
  });

  test("operator Bookings cards stack on a phone", async ({ context, page }) => {
    await signInAs(context, "operator");
    await visit(page, "/tours/operator/bookings");
  });

  test("the notifications panel opens inside the screen", async ({ context, page }) => {
    await signInAs(context, "tourist");
    await page.goto("/tours/messages", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /notification/i }).first().click();
    const panel = page.getByText("Mark all read").locator("xpath=ancestor::div[contains(@class,'rounded-2xl')][1]");
    await expect(panel).toBeVisible();
    const box = (await panel.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(360);
    expect(await offScreen(page)).toEqual([]);
    // The floating chat button steps aside while the panel is open.
    await expect(page.getByRole("button", { name: "Daet AI assistant" })).toBeHidden();
  });
});
