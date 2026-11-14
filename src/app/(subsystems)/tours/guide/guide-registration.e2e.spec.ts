import { expect, test } from "@playwright/test";

const applicant = {
  name: "Maya Santos",
  phone: "09171234567",
  bio: "I have guided visitors around Daet for several years.",
};

test("guide application remains a three-step flow and cannot pass ID consent unchecked", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await page.getByRole("link", { name: /^guides$/i }).click();

  await expect(page.getByRole("heading", { name: /register as a local guide/i })).toBeVisible();
  await expect(page.getByRole("list", { name: /guide application steps/i }).getByRole("listitem")).toHaveCount(3);

  await page.getByLabel(/full name/i).fill(applicant.name);
  await page.getByLabel(/contact number/i).fill(applicant.phone);
  await page.getByLabel(/guide introduction/i).fill(applicant.bio);
  await page.getByRole("button", { name: /continue/i }).click();

  await expect(page.getByRole("group", { name: /identity verification & consent/i })).toBeVisible();
  await page.getByLabel(/government id type/i).selectOption("philippine_national_id");
  await page.getByRole("textbox", { name: /^id number/i }).fill("1234-5678-9012");
  await page.getByLabel(/id image or pdf/i).setInputFiles({
    name: "identity.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.7 test identity document"),
  });

  const consent = page.getByRole("checkbox");
  await expect(consent).not.toBeChecked();
  await page.getByRole("button", { name: /continue/i }).click();
  await expect(page.getByText(/consent is required before we can store your id/i)).toBeVisible();
  await expect(page.getByRole("group", { name: /identity verification & consent/i })).toBeVisible();

  await consent.check();
  await page.getByRole("button", { name: /continue/i }).click();
  await expect(page.getByRole("group", { name: /guide badge qr preview/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /connect supabase to submit/i })).toBeDisabled();
  await expect(page.getByText(/connect supabase to prepare a secure guide qr preview/i)).toBeVisible();
});

test("dashboard and My QR routes show no guide content in unconfigured preview mode", async ({ page }) => {
  for (const route of ["/tours/guide/dashboard", "/tours/guide/my-qr"]) {
    await page.goto(route);
    await expect(page.getByText(/supabase setup is needed/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: /my qr code|welcome,/i })).toHaveCount(0);
  }
});
