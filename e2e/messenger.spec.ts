import { expect, test } from "@playwright/test";
import { checkA11y, signInAs } from "./fixtures";

test.use({ viewport: { width: 375, height: 812 }, isMobile: true });

test("the Daet AI assistant is pinned at the top of Messages and keeps the chat on the account", async ({ context, page }) => {
  await signInAs(context, "tourist");
  await page.goto("/tours/messages", { waitUntil: "networkidle" });
  const pinned = page.getByRole("link", { name: /^Daet AI assistant Pinned/ });
  await expect(pinned).toBeVisible();
  await pinned.click();
  await expect(page).toHaveURL(/\/tours\/messages\/ai$/);
  await expect(page.getByRole("heading", { level: 1, name: "Daet AI assistant" })).toBeVisible();
  await expect(page.getByText(/Saved to your account/)).toBeVisible();
  await page.getByRole("button", { name: "Where to eat near Bagasbas?" }).click();
  await expect(page.getByRole("link", { name: /Get directions to Bagasbas Beach eateries/ })).toBeVisible();
  await checkA11y(page, "AI chat in Messages");
});
