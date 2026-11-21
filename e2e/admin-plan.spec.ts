import { expect, test } from "@playwright/test";
import { signInAs, visit } from "./fixtures";

for (const viewport of [
  { width: 375, height: 812 },
  { width: 1400, height: 900 },
]) {
  test.describe(`admin planner at ${viewport.width}px`, () => {
    test.use({ viewport });

    test("names the admin context and has 44px send and mic targets", async ({ page, context }) => {
      await signInAs(context, "admin");
      await visit(page, "/tours/admin/plan", "Where to in Daet?");
      await expect(page.getByText("Admin: trip planner")).toBeVisible();
      const send = await page.getByRole("button", { name: "Send" }).boundingBox();
      expect(send!.width).toBeGreaterThanOrEqual(44);
      expect(send!.height).toBeGreaterThanOrEqual(44);
      const mic = page.getByRole("button", { name: /Speak your message|Stop listening/ });
      if (await mic.count()) expect((await mic.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      if (viewport.width < 640) {
        const list = await page.locator("#try-asking + ul").boundingBox();
        expect(list!.height).toBeLessThan(420);
      }
      await page.screenshot({ path: `test-results/admin-plan-${viewport.width}.png`, fullPage: true });
    });
  });
}
