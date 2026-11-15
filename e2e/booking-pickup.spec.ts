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

test.describe("door pickup", () => {
  test.use({ geolocation: { latitude: 14.1395, longitude: 122.993 }, permissions: ["geolocation"] });

  test("a tourist pins where they are, picks a vehicle, and the fee goes to the total", async ({ context, page }) => {
    await signInAs(context, "tourist");
    await page.goto(BOOK, { waitUntil: "networkidle" });
    const total = page.getByText("Total", { exact: true }).locator("xpath=following-sibling::span");
    const before = pesos(await total.textContent());

    await page.getByLabel("Pickup location").selectOption({ label: "Pick me up where I am (door pickup)" });
    await expect(page.getByText("Pin your location to see the fee.").first()).toBeVisible();
    await page.getByRole("button", { name: "Use my location" }).click();
    const vehicles = page.getByRole("group", { name: "2. Choose the vehicle" });
    await expect(vehicles.getByText("6.9 km · ₱154.00")).toBeVisible();
    await vehicles.getByLabel(/Tricycle/).check();
    await page.getByLabel("Landmark for the driver (optional)").fill("Surf shop gate");
    await expect.poll(async () => pesos(await total.textContent())).toBe(before + 154);
    await expect(page.locator("dl").filter({ hasText: "Pickup" }).getByText("(door pickup, 6.9 km)")).toBeVisible();
  });
});
