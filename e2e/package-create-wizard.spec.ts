import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { signInAs, visit } from "./fixtures";

/**
 * The five-step create flow at phone width: a progress indicator, a draft saved
 * after every step, and a review screen built from the editor's summary cards.
 * Runs against the mock Supabase (e2e/mock-supabase.cjs), which keeps the draft
 * the way Postgres would.
 */

const MOCK = process.env.MOCK_SUPABASE_URL ?? "http://127.0.0.1:54329";
/** The device copy of the draft; see create/draft-storage.ts. */
const STORAGE_KEY = "daet:package-create-draft:v1";
const CREATE_PATH = "/tours/operator/packages/create";

async function expectNoAxeViolations(page: Page, where: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(
    violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`),
    `${where}: axe violations`,
  ).toEqual([]);
}

test.beforeEach(async ({ request }) => {
  await request.get(`${MOCK}/__reset_drafts`);
});

test("saves a draft after every step and submits the finished package", async ({ page, context }) => {
  await signInAs(context, "operator");
  await visit(page, CREATE_PATH, "New tour package");

  await expect(page.getByText("Step 1 of 5: Basics")).toBeVisible();

  await page.getByLabel(/Package title/i).fill("Bagasbas surf lesson for beginners");
  await page.getByLabel(/Where the tour starts/i).fill("Bagasbas Beach, Daet");
  await page.getByLabel(/How long the tour takes/i).fill("3");
  await page.getByLabel(/What the tour is like/i).fill("Two hours with a local instructor, board and rash guard included.");
  await page.getByRole("button", { name: "Save & continue" }).click();

  // Step 1 is on the server as a draft before the next step appears.
  await expect(page.getByText("Step 2 of 5: Photos")).toBeVisible();
  await expect(page.getByText(/Draft saved at/)).toBeVisible();

  // Photos are optional, so skip straight on.
  await page.getByRole("button", { name: "Save & continue" }).click();
  await expect(page.getByText(/Step 3 of 5: Prices/)).toBeVisible();

  await page.getByRole("button", { name: /Add Variant/ }).click();
  await page.getByLabel("Variant Name").fill("Standard");
  await page.getByLabel("Min Participants").fill("1");
  await page.getByLabel("Price per Person").fill("950");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("cell", { name: "Standard", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save & continue" }).click();

  await expect(page.getByText(/Step 4 of 5: What's included/)).toBeVisible();
  await page.getByRole("button", { name: /Add Item/ }).click();
  await page.getByLabel("Description").fill("Board and rash guard");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("button", { name: "Save & continue" }).click();

  await expect(page.getByText(/Step 5 of 5: Route & stops/)).toBeVisible();
  // Stops are chosen by name from the attractions list — never by coordinate.
  await page.getByRole("button", { name: "Add stop" }).click();
  await page.getByRole("combobox", { name: "Find an attraction" }).fill("Bagasbas");
  await page.getByRole("option", { name: "Bagasbas Beach" }).click();
  await page.getByRole("button", { name: "Save stop" }).click();
  await expect(page.getByText("Bagasbas Beach").first()).toBeVisible();
  await page.getByRole("button", { name: "Review package" }).click();

  // The review reuses the editor's section summaries.
  await expect(page.getByText(/Final check/)).toBeVisible();
  await expect(page.getByText("Board and rash guard", { exact: true })).toBeVisible();
  await expect(page.getByText("₱950.00 per guest")).toBeVisible();
  await expectNoAxeViolations(page, "create wizard review");

  await page.getByRole("button", { name: "Submit for review" }).click();

  await expect(page).toHaveURL(/\/tours\/operator\/packages\?submitted=true/);
});

test("keeps the half-finished draft when the page is reloaded", async ({ page, context }) => {
  await signInAs(context, "operator");
  await page.goto(CREATE_PATH, { waitUntil: "networkidle" });

  await page.getByLabel(/Package title/i).fill("Daet heritage walk");
  await page.getByLabel(/Where the tour starts/i).fill("Rizal Monument, Daet");
  await page.getByRole("button", { name: "Save & continue" }).click();
  await expect(page.getByText("Step 2 of 5: Photos")).toBeVisible();

  // The device copy is written as the operator types, so it is there to reload from.
  await page.waitForFunction((key) => window.localStorage.getItem(key) !== null, STORAGE_KEY);

  await page.reload({ waitUntil: "networkidle" });

  // The wizard comes back on step 1 and offers the device copy to restore.
  await expect(page.getByText("Step 1 of 5: Basics")).toBeVisible();
  await expect(page.getByText(/Pick up where you left off/i))
    .toBeVisible({ timeout: 15_000 })
    .catch(async (error: Error) => {
      const stored = await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY);
      throw new Error(`${error.message}\nDevice copy after reload: ${stored ?? "(empty)"}`);
    });
  await page.getByRole("button", { name: "Restore my work" }).click();

  await expect(page.getByText("Step 2 of 5: Photos")).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByLabel(/Package title/i)).toHaveValue("Daet heritage walk");
});

test("the server still refuses an incomplete package and says where to fix it", async ({ page, context }) => {
  await signInAs(context, "operator");
  await page.goto(CREATE_PATH, { waitUntil: "networkidle" });

  await page.getByLabel(/Package title/i).fill("Apuao island hop");
  await page.getByLabel(/Where the tour starts/i).fill("Bagasbas Beach, Daet");

  for (const label of ["Save & continue", "Save & continue", "Save & continue", "Save & continue", "Review package"]) {
    await page.getByRole("button", { name: label }).click();
    await expect(page.getByRole("button", { name: "Save & finish later" })).toBeEnabled();
  }

  await expect(page.getByText(/Final check/)).toBeVisible();
  await page.getByRole("button", { name: "Submit for review" }).click();

  // The Tourism Office needs a price option before it can review anything.
  await expect(page.getByText(/Step 3 of 5: Prices/)).toBeVisible();
  await expect(page.getByText(/need attention/i)).toBeVisible();
});
