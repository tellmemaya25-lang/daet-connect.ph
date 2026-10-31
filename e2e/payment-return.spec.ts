import { expect, test } from "@playwright/test";
import { checkA11y, signInAs } from "./fixtures";

const BID = "e9466de5-4877-47c1-ac14-d86deeb38b9e";

test.describe("returning from PayMongo", () => {
  test("lands on the payment page, not the booking page", async ({ context, page }) => {
    await signInAs(context, "tourist");
    // Old checkouts return with ?payment=success; they now go to the success page too.
    await page.goto(`/tours/bookings/${BID}?payment=success`, { waitUntil: "networkidle" });
    await expect(page).toHaveURL(new RegExp(`/tours/bookings/${BID}/paid$`));
    // The mock has a PayMongo payment from a minute ago (as if the webhook got there first).
    await expect(page.getByRole("heading", { level: 1, name: "Payment successful" })).toBeVisible();
    await expect(page.getByText(/₱500\.00 received via GCash/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Show my ticket QR" })).toBeVisible();
    await expect(page.getByRole("link", { name: "View booking" })).toHaveAttribute("href", `/tours/bookings/${BID}`);
    await checkA11y(page, "payment return");
  });

  test("a cancelled checkout still shows on the booking page", async ({ context, page }) => {
    await signInAs(context, "tourist");
    await page.goto(`/tours/bookings/${BID}?payment=cancelled`, { waitUntil: "networkidle" });
    await expect(page.getByText("The online payment was cancelled. You have not been charged.")).toBeVisible();
  });
});
