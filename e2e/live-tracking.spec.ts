import { expect, test, type Browser } from "@playwright/test";
import { checkA11y, signInAs } from "./fixtures";

const BID = "e9466de5-4877-47c1-ac14-d86deeb38b9e";
const MOCK = "http://127.0.0.1:54329";
// Rizal Park, Daet; then a spot on Bagasbas Beach.
const RIZAL = { latitude: 14.1131, longitude: 122.9545, accuracy: 12 };
const BAGASBAS = { latitude: 14.1316, longitude: 122.9851, accuracy: 20 };

async function as(browser: Browser, role: "guide" | "tourist" | "operator", geolocation = RIZAL) {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, geolocation, permissions: ["geolocation"] });
  await signInAs(context, role);
  return { context, page: await context.newPage() };
}

test.describe("live tour tracking", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async ({ request }) => {
    await request.post(`${MOCK}/__reset_live`);
  });

  test("the guide starts the tour, shares their location and marks a stop", async ({ browser }) => {
    const { context, page } = await as(browser, "guide");
    await page.goto(`/tours/guide/tours/${BID}/live`, { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { level: 1, name: "Live map" })).toBeVisible();
    await page.getByRole("button", { name: "Start live tour" }).click();
    await expect(page.getByText("Live", { exact: true })).toBeVisible();
    await expect(page.getByText(/^Sharing your location\./)).toBeVisible({ timeout: 15_000 });
    // Tiles are blocked in tests, so the sketch map stands in, with the guide on it.
    await expect(page.getByRole("img", { name: /Live map for Bagasbas Sunrise Surf Lesson/ })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Arrived at stop 1" }).click();
    await expect(page.getByRole("button", { name: "Arrived at stop 2" })).toBeVisible();
    await checkA11y(page, "guide live map");
    await context.close();
  });

  test("the tourist chooses to share and can send “I'm separated”", async ({ browser }) => {
    const { context, page } = await as(browser, "tourist", BAGASBAS);
    await page.goto(`/tours/bookings/${BID}`, { waitUntil: "networkidle" });
    const card = page.getByRole("region", { name: "Find your guide" });
    await expect(card).toBeVisible();
    await expect(card.getByText(/Live now/)).toBeVisible();
    const share = card.getByRole("switch", { name: /Share my location during the tour/ });
    await expect(share).not.toBeChecked();
    await share.check();
    await expect(share).toBeChecked();
    await expect(card.getByText(/^Sharing your location\./)).toBeVisible({ timeout: 15_000 });
    await card.getByRole("button", { name: "I'm separated from my group" }).click();
    await expect(card.getByText("Your guide was told")).toBeVisible({ timeout: 15_000 });
    await checkA11y(page, "tourist live card");
    await context.close();
  });

  test("the guide sees the alert and marks the guest found", async ({ browser }) => {
    const { context, page } = await as(browser, "guide");
    await page.goto(`/tours/guide/tours/${BID}/live`, { waitUntil: "networkidle" });
    await expect(page.getByRole("alert").filter({ hasText: "tapped “I'm separated”" })).toBeVisible();
    await expect(page.getByText(/Sharing live/)).toBeVisible();
    await page.getByRole("button", { name: "Mark as found" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "tapped “I'm separated”" })).toHaveCount(0);
    await context.close();
  });

  test("the operator sees the tour on Live now, then the guide ends it", async ({ browser }) => {
    const operator = await as(browser, "operator");
    await operator.page.goto("/tours/operator/live", { waitUntil: "networkidle" });
    await expect(operator.page.getByRole("heading", { level: 1, name: "Live now" })).toBeVisible();
    await operator.page.getByRole("link", { name: /Bagasbas Sunrise Surf Lesson/ }).first().click();
    await expect(operator.page.getByRole("heading", { level: 1, name: "Live map" })).toBeVisible();
    await checkA11y(operator.page, "operator live map");
    await operator.context.close();

    const guide = await as(browser, "guide");
    await guide.page.goto(`/tours/guide/tours/${BID}/live`, { waitUntil: "networkidle" });
    await guide.page.getByRole("button", { name: "End tour and stop sharing" }).click();
    await guide.page.getByRole("button", { name: "End tour", exact: true }).click();
    await expect(guide.page.getByText(/^Ended /)).toBeVisible();
    await guide.context.close();
  });
});
