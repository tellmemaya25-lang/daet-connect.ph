import { expect, test } from "@playwright/test";
import { checkA11y, visit } from "./fixtures";

/**
 * The landing fan, at phone width and at desktop width.
 *
 * Clicks go through the keyboard (focus, then Enter) rather than the pointer:
 * every wedge is a full-size button clipped into a slice, so a click at the
 * centre of its box lands where two wedges meet. Enter is also one of the ways
 * the handoff requires the fan to open, so this covers that path too.
 *
 * The browser is told to prefer reduced motion, so nothing waits on a 450ms
 * fold: the panel is in place as soon as the state changes.
 */
test.use({ reducedMotion: "reduce" });

const panel = (page: import("@playwright/test").Page, name: string) => page.getByRole("region", { name });

test.describe("home fan on a phone", () => {
  test("shows six places, one per wedge", async ({ page }) => {
    await visit(page, "/");
    const fan = page.getByRole("group", { name: "Places in Daet" });

    await expect(fan.getByRole("button")).toHaveCount(6);
    await expect(page.getByRole("link", { name: "Find a tour" })).toHaveCount(0);
    await expect(page.getByText("Tap a place to see it")).toBeVisible();
  });

  test("opens a place in a sheet, and closes it again", async ({ page }) => {
    await visit(page, "/");
    const wedge = page.getByRole("button", { name: "Bagasbas Beach: open photo and details" });

    await wedge.focus();
    await page.keyboard.press("Enter");

    await expect(page.getByRole("heading", { level: 2, name: "Bagasbas Beach" })).toBeVisible();
    await expect(page.getByText(/ten minutes from the plaza/)).toBeVisible();
    await expect(page).toHaveURL(/#place-bagasbas-beach/);
    await checkA11y(page, "home, a place open");

    await page.keyboard.press("Escape");

    await expect(page.getByRole("heading", { level: 2, name: "Bagasbas Beach" })).toHaveCount(0);
    await expect(page).not.toHaveURL(/#place-/);
  });

  test("steps to the next place while open", async ({ page }) => {
    await visit(page, "/");
    await page.getByRole("button", { name: "Bagasbas Beach: open photo and details" }).focus();
    await page.keyboard.press("Enter");

    await page.keyboard.press("ArrowRight");

    await expect(page.getByRole("heading", { level: 2, name: "First Rizal Monument" })).toBeVisible();
    await expect(page).toHaveURL(/#place-first-rizal-monument/);
  });

  test("closes when the Back button takes the hash away", async ({ page }) => {
    await visit(page, "/");
    await page.getByRole("button", { name: "Bagasbas Beach: open photo and details" }).focus();
    await page.keyboard.press("Enter");
    await expect(panel(page, "Bagasbas Beach")).toBeVisible();

    await page.goBack();

    await expect(page.getByRole("heading", { level: 2, name: "Bagasbas Beach" })).toHaveCount(0);
  });

  test("opens straight onto the place a shared link names", async ({ page }) => {
    await visit(page, "/#place-cathedral-most-holy-trinity");

    await expect(page.getByRole("heading", { level: 2, name: "Cathedral of the Most Holy Trinity" })).toBeVisible();
    await expect(page.getByText("6 of 6")).toBeVisible();
  });

  test("hands off to the places below it", async ({ page }) => {
    await visit(page, "/");

    await expect(page.getByRole("heading", { level: 2, name: "Places to start" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Trips you can book" })).toBeVisible();
  });
});

test.describe("home fan on a desktop", () => {
  test.use({ viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false });

  test("keeps the headline's links", async ({ page }) => {
    await visit(page, "/");

    await expect(page.getByRole("link", { name: "Find a tour" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Ask the travel guide" })).toBeVisible();
  });

  test("names a wedge when the mouse is over the fan", async ({ page }) => {
    await visit(page, "/");

    // A point inside the leftmost wedge, clear of the apex where they all meet.
    await page.mouse.move(250, 450);

    await expect
      .poll(async () =>
        page.evaluate(() =>
          Math.max(...Array.from(document.querySelectorAll("[data-chip]")).map((chip) => Number(getComputedStyle(chip).opacity))),
        ),
      )
      .toBeGreaterThan(0.5);
  });

  test("opens the place as a panel beside the photo, and folds it back on Escape", async ({ page }) => {
    await visit(page, "/");
    const wedge = page.getByRole("button", { name: "Bagasbas Beach: open photo and details" });

    await wedge.focus();
    await page.keyboard.press("Enter");

    await expect(page.getByRole("heading", { level: 2, name: "Bagasbas Beach" })).toBeVisible();
    await expect(page.getByRole("link", { name: "See the place" })).toHaveAttribute(
      "href",
      "/tours/attractions/bagasbas-beach",
    );
    await expect(page).toHaveURL(/#place-bagasbas-beach/);
    await checkA11y(page, "home, a place open, desktop");

    await page.keyboard.press("Escape");

    await expect(page.getByRole("heading", { level: 2, name: "Bagasbas Beach" })).toHaveCount(0);
    await expect(wedge).toHaveAttribute("aria-expanded", "false");
  });

  test("never scrolls sideways", async ({ page }) => {
    await visit(page, "/");
    await page.getByRole("button", { name: "Bagasbas Beach: open photo and details" }).focus();
    await page.keyboard.press("Enter");

    const overflow = await page.evaluate(
      () => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
