import { expect, test, type Locator } from "@playwright/test";
import { signInAs } from "./fixtures";

test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

/** A finger drag on `target` by `dy` pixels (touch pointer events). */
async function swipe(target: Locator, dy: number) {
  const box = await target.boundingBox();
  if (!box) throw new Error("nothing to swipe");
  const x = box.x + box.width / 2;
  const y = box.y + Math.min(box.height / 2, 20);
  const init = { pointerId: 7, pointerType: "touch", isPrimary: true, bubbles: true };
  await target.dispatchEvent("pointerdown", { ...init, clientX: x, clientY: y });
  for (let i = 1; i <= 6; i++) await target.dispatchEvent("pointermove", { ...init, clientX: x, clientY: y + (dy * i) / 6 });
  await target.dispatchEvent("pointerup", { ...init, clientX: x, clientY: y + dy });
}

test.describe("phone gestures", () => {
  test("swiping the You sheet down closes it; a small drag springs back", async ({ context, page }) => {
    await signInAs(context, "tourist");
    await page.goto("/tours/me", { waitUntil: "networkidle" });
    const you = page.getByRole("button", { name: /^You, your account/ });
    await you.click();
    const sheet = page.getByRole("navigation", { name: "Your account" });
    await expect(sheet).toBeVisible();

    await swipe(sheet, 30);
    await expect(sheet).toBeVisible();

    await swipe(sheet, 200);
    await expect(sheet).toHaveCount(0);
    await expect(you).toHaveAttribute("aria-expanded", "false");
  });

  test("swiping the Menu sheet up by its handle closes it", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await page.getByRole("banner").locator("summary").click();
    const menu = page.getByRole("navigation", { name: "Menu" });
    await expect(menu).toBeVisible();
    await swipe(menu.locator("[aria-hidden='true'].touch-none"), -220);
    await expect(menu).toBeHidden();
    await expect(page.getByRole("banner").locator("details")).not.toHaveAttribute("open", "");
  });
});
