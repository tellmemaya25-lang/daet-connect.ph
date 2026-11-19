import { expect, test } from "@playwright/test";
import { signInAs } from "./fixtures";

// Owner's list, item 5: the booking price includes the pickup the tourist picks.
test.use({ viewport: { width: 1280, height: 900 } });

const BOOK = "/tours/packages/aa000000-0000-4000-8000-000000000001/book";
const pesos = (text: string | null) => Number((text ?? "").replace(/[^\d.]/g, ""));

test("pick me up at a Daet spot: the operator's van, to the meeting point, price added to the total", async ({ context, page }) => {
  await signInAs(context, "tourist");
  await page.goto(BOOK, { waitUntil: "networkidle" });
  const total = page.getByText("Total", { exact: true }).locator("xpath=following-sibling::span");
  const before = pesos(await total.textContent());

  // Two choices: no pickup (free) or a pickup.
  await expect(page.getByLabel("Pickup location").locator("option")).toHaveCount(2);
  await page.getByLabel("Pickup location").selectOption({ label: "Yes, pick me up (fee added to my total)" });
  await expect(page.getByText("Choose where you are to see the pickup price.")).toBeVisible();
  // One vehicle, set by the operator; the tricycle has no official fare and is not offered.
  await expect(page.getByText("Small van", { exact: true })).toBeVisible();
  await page.getByLabel("Pick me up at").selectOption({ label: "Daet Heritage Center and Museum" });
  await expect(page.getByLabel("Landmark for the driver (optional)")).toHaveValue("Daet Heritage Center and Museum");
  // 0.2 km by road x ₱2.60 x 1 guest = ₱0.52 → ₱1.
  await expect(page.getByRole("status").filter({ hasText: "0.2 km · ₱1.00" })).toBeVisible();
  // The vehicle's real name, from the server's quote (not "van" for every vehicle).
  await expect(page.getByRole("status").filter({ hasText: "small van pickup" })).toBeVisible();
  await expect.poll(async () => pesos(await total.textContent())).toBe(before + 1);
});

test("a group too big for the vehicle is told why, from the server's quote", async ({ context, page }) => {
  await signInAs(context, "tourist");
  await page.goto(BOOK, { waitUntil: "networkidle" });
  await page.getByLabel("Pickup location").selectOption({ label: "Yes, pick me up (fee added to my total)" });
  await page.getByLabel("Pick me up at").selectOption({ label: "Daet Heritage Center and Museum" });
  await expect(page.getByRole("status").filter({ hasText: "0.2 km" })).toBeVisible();
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "One more participant" }).click();
  await expect(page.getByRole("status").filter({ hasText: "The small van seats 3; you are 4." })).toBeVisible();
});

test.describe("pickup from anywhere on the map", () => {
  test.use({ geolocation: { latitude: 14.1395, longitude: 122.993 }, permissions: ["geolocation"] });

  test("a tourist pins where they are and the fee goes to the total", async ({ context, page }) => {
    await signInAs(context, "tourist");
    await page.goto(BOOK, { waitUntil: "networkidle" });
    const total = page.getByText("Total", { exact: true }).locator("xpath=following-sibling::span");
    const before = pesos(await total.textContent());

    await page.getByLabel("Pickup location").selectOption({ label: "Yes, pick me up (fee added to my total)" });
    await page.getByLabel("Pick me up at").selectOption({ label: "Somewhere else (pin it on the map)" });
    await page.getByRole("button", { name: "Use my location" }).click();
    await expect(page.getByRole("status").filter({ hasText: "6.9 km · ₱18.00" })).toBeVisible();
    await page.getByLabel("Landmark for the driver (optional)").fill("Surf shop gate");
    await expect.poll(async () => pesos(await total.textContent())).toBe(before + 18);
    await expect(page.locator("dl").filter({ hasText: "Pickup" }).getByText("(door pickup, 6.9 km)")).toBeVisible();
  });
});
