import { expect, test } from "@playwright/test";
import { signInAs } from "./fixtures";

// Owner's list, item 5: the booking price includes the pickup the tourist picks.
test.use({ viewport: { width: 1280, height: 900 } });

const BOOK = "/tours/packages/aa000000-0000-4000-8000-000000000001/book";
const pesos = (text: string | null) => Number((text ?? "").replace(/[^\d.]/g, ""));

test("a pickup spot shortcut drops the pin there and prices the van from it", async ({ context, page }) => {
  await signInAs(context, "tourist");
  await page.goto(BOOK, { waitUntil: "networkidle" });
  const total = page.getByText("Total", { exact: true }).locator("xpath=following-sibling::span");
  const before = pesos(await total.textContent());

  await page.getByLabel("Pickup location").selectOption({ label: "Pick me up where I am (door pickup)" });
  // Operator pickup points are gone: only "no pickup" and door pickup.
  await expect(page.getByLabel("Pickup location").locator("option")).toHaveCount(2);
  const spot = page.getByRole("group", { name: "Common pickup spots" }).getByRole("button", { name: "Daet Heritage Center and Museum" });
  await spot.click();
  await expect(spot).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Landmark for the driver (optional)")).toHaveValue("Daet Heritage Center and Museum");
  // 0.2 km by road to the meeting point x ₱2.60 x 1 guest = ₱0.52 → ₱1.
  await page.getByRole("group", { name: "2. Choose the vehicle" }).getByLabel(/Small van/).check();
  await expect.poll(async () => pesos(await total.textContent())).toBeGreaterThan(before);
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
    await expect(vehicles.getByText("6.9 km · ₱18.00")).toBeVisible();
    await expect(vehicles.getByText("Tricycle")).toHaveCount(0);
    await vehicles.getByLabel(/Small van/).check();
    await page.getByLabel("Landmark for the driver (optional)").fill("Surf shop gate");
    await expect.poll(async () => pesos(await total.textContent())).toBe(before + 18);
    await expect(page.locator("dl").filter({ hasText: "Pickup" }).getByText("(door pickup, 6.9 km)")).toBeVisible();
  });
});
