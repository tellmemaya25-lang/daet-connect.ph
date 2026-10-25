import { test } from "@playwright/test";
import { visit } from "./fixtures";

// Signed-out visitor: discovery pages.
test.describe("public pages", () => {
  for (const path of [
    "/",
    "/tours/browse",
    "/tours/packages/aa000000-0000-4000-8000-000000000001",
    "/tours/attractions",
    "/tours/attractions/bagasbas-beach",
    "/tours/events",
    "/tours/events/e1000000-0000-4000-8000-000000000001",
    "/tours/merch",
    "/tours/plan",
    "/login",
    "/signup",
    "/forgot-password",
  ]) {
    test(`renders ${path}`, async ({ page }) => {
      await visit(page, path);
    });
  }
});
