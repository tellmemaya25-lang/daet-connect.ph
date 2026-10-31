import { expect, test, type Page } from "@playwright/test";
import { offScreen } from "./fixtures";

// The package itinerary beside its map: opening a stop shows its details and
// focuses the map on it (tiles are blocked here, so the sketch map stands in).
const PACKAGE = "/tours/packages/aa000000-0000-4000-8000-000000000001";

async function itinerary(page: Page) {
  await page.goto(PACKAGE, { waitUntil: "networkidle" });
  const section = page.locator("section[aria-labelledby='itinerary']");
  await expect(section.getByRole("heading", { name: "The route, stop by stop" })).toBeVisible();
  return section;
}

const stopButton = (section: ReturnType<Page["locator"]>, name: string) => section.getByRole("button", { name: new RegExp(`^${name}`) });

for (const width of [375, 1280]) {
  test(`opening stops focuses the map, one at a time (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 768 ? 812 : 900 });
    const section = await itinerary(page);
    await expect(section.getByText("Meet at")).toBeVisible();

    await stopButton(section, "Daet Heritage Center").click();
    await expect(stopButton(section, "Daet Heritage Center")).toHaveAttribute("aria-expanded", "true");
    await expect(section.getByText(/Viewing/)).toContainText("Viewing Daet Heritage Center");
    await expect(section.getByRole("link", { name: "More about Daet Heritage Center" })).toHaveAttribute("href", "/tours/attractions/daet-heritage-center");
    await expect(section.getByText("Stop 2 of 3")).toBeVisible();

    await section.getByRole("button", { name: "Next stop", exact: true }).click();
    await expect(stopButton(section, "Bagasbas Beach")).toHaveAttribute("aria-expanded", "true");
    await expect(stopButton(section, "Daet Heritage Center")).toHaveAttribute("aria-expanded", "false");
    await expect(section.getByText(/Viewing/)).toContainText("Viewing Bagasbas Beach");
    await expect(section.getByRole("img", { name: /Bagasbas/ }).first()).toBeVisible();

    await section.getByRole("button", { name: "Show all stops", exact: true }).click();
    await expect(section.getByText(/Viewing/)).toHaveCount(0);
    await expect(stopButton(section, "Bagasbas Beach")).toHaveAttribute("aria-expanded", "false");

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    expect(await offScreen(page)).toEqual([]);
  });
}
