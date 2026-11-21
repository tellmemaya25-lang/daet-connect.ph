import { expect, test } from "@playwright/test";
import { signInAs } from "./fixtures";

for (const [w, h] of [[375, 900], [1400, 900]] as const) {
  test(`admin backup form at ${w}px`, async ({ context, page }) => {
    await signInAs(context, "admin");
    await page.setViewportSize({ width: w, height: h });
    await page.goto("/tours/admin/backup");
    const s = page.getByRole("region", { name: "Choose what to save" });
    await expect(s.getByTestId("backup-summary")).toContainText("13 of 15 items selected in 4 of 4 groups");
    await s.getByRole("button", { name: "Select none" }).click();
    await expect(s.getByTestId("backup-summary")).toContainText("Nothing selected");
    await expect(s.getByRole("button", { name: "Download backup" })).toBeDisabled();
    await s.getByRole("button", { name: "Select all" }).click();
    await expect(s.getByTestId("backup-summary")).toContainText("15 of 15");
    await s.getByRole("checkbox", { name: /Activity log/ }).uncheck();
    await expect(s.getByTestId("backup-summary")).toContainText("14 of 15");
    await expect(s.getByText("Bank, GCash, permit and ID details are never included.").last()).toBeVisible();
    const sel = s.getByLabel("Format");
    expect(await sel.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
