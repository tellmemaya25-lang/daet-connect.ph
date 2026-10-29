import { expect, test } from "@playwright/test";
import { checkA11y, signInAs, type Role } from "./fixtures";

/** Adviser revisions (docs/ADVISER_REVISIONS.md). */
test.use({ viewport: { width: 375, height: 812 }, isMobile: true });

const mainNav = (page: import("@playwright/test").Page) => page.getByRole("navigation", { name: "Main navigation" });

test.describe("R1: the exploration menu is only for visitors and tourists", () => {
  test("visitors see it", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await expect(mainNav(page).getByRole("link", { name: "Souvenirs" })).toHaveCount(1);
  });

  const homes: Record<Role, string> = { tourist: "/tours/me", operator: "/tours/operator/dashboard", guide: "/tours/guide/dashboard", admin: "/tours/admin" };
  for (const role of Object.keys(homes) as Role[]) {
    test(`${role} dashboard`, async ({ context, page }) => {
      await signInAs(context, role);
      await page.goto(homes[role], { waitUntil: "networkidle" });
      await expect(mainNav(page).getByRole("link", { name: "Souvenirs" })).toHaveCount(role === "tourist" ? 1 : 0);
      await expect(mainNav(page).getByRole("link", { name: "Plan a trip" })).toHaveCount(role === "tourist" ? 1 : 0);
    });
  }
});

test("R2: All selects every category in the planner, and again clears them", async ({ page }) => {
  await page.goto("/tours/plan", { waitUntil: "networkidle" });
  const interests = page.getByRole("group", { name: "What do you enjoy?" });
  const all = interests.getByRole("button", { name: "All", exact: true });
  await expect(all).toHaveAttribute("aria-pressed", "false");
  await all.click();
  await expect(all).toHaveAttribute("aria-pressed", "true");
  for (const chip of await interests.getByRole("button").all()) await expect(chip).toHaveAttribute("aria-pressed", "true");
  await checkA11y(page, "planner with all categories");
  await all.click();
  for (const chip of await interests.getByRole("button").all()) await expect(chip).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByText("No preference: we'll mix everything.")).toBeVisible();
  await page.getByRole("button", { name: /plan my trip/i }).click();
  await expect(page.getByText(/Day 1/).first()).toBeVisible({ timeout: 30_000 });
});

test("R3: package prices show two decimals", async ({ page }) => {
  await page.goto("/tours/browse", { waitUntil: "networkidle" });
  await expect(page.getByText(/₱[\d,]+\.\d{2}/).first()).toBeVisible();
  await expect(page.getByText(/₱[\d,]+(?![\d.,])/)).toHaveCount(0);
});
