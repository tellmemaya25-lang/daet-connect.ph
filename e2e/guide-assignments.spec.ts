import { expect, test } from "@playwright/test";
import { signInAs, visit } from "./fixtures";

test.describe("admin guide assignments", () => {
  for (const [name, width, height] of [["375", 375, 800], ["1400", 1400, 900]] as const) {
    test(`shows the waiting booking and the package guides at ${name}px`, async ({ context, page }, info) => {
      await page.setViewportSize({ width, height });
      await signInAs(context, "admin");
      await visit(page, "/tours/admin/guide-assignments", "Guide assignments");

      await expect(page.getByText("No published packages yet.")).toHaveCount(0);
      await expect(page.getByText("Upcoming bookings without a guide (1)")).toBeVisible();
      await expect(page.getByText("Picked automatically: Liza Bautista, waiting for the operator to approve.")).toBeVisible();
      const pkg = page.getByRole("group", { name: "Bagasbas Sunrise Surf Lesson" });
      await expect(pkg.getByLabel("Jeremiah Sabihon")).toBeChecked();
      await expect(pkg.getByLabel("Liza Bautista")).not.toBeChecked();
      await page.screenshot({ path: info.outputPath(`guide-assignments-${name}.png`), fullPage: true });
    });
  }
});
