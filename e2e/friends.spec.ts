import { expect, test } from "@playwright/test";
import { checkA11y, signInAs } from "./fixtures";

// Friends and sharing trip plans with them (20261210). Who can see what is
// decided in the database (tested there); this checks the screens.
test.describe("friends", () => {
  test("a tourist finds people, answers requests and opens a friend's plan", async ({ context, page }) => {
    await signInAs(context, "tourist");
    await page.goto("/tours/friends", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "Your friends (1)" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Friend requests" }).getByText("Carlo Reyes")).toBeVisible();
    await checkA11y(page, "friends");

    await page.getByRole("searchbox", { name: "Find friends" }).fill("Dina");
    await page.getByRole("searchbox", { name: "Find friends" }).press("Enter");
    const results = page.getByRole("list", { name: "Search results" });
    await expect(results.getByText("Dina Cruz")).toBeVisible();
    await expect(results.getByRole("button", { name: "Add friend" })).toBeVisible();

    await page.getByRole("link", { name: "Calaguas weekend" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Calaguas weekend" })).toBeVisible();
    await expect(page.getByText("Shared by Bea Santos")).toBeVisible();
    await checkA11y(page, "friend plan");
  });

  test("a tourist shares a saved plan with friends", async ({ context, page }) => {
    await signInAs(context, "tourist");
    await page.goto("/tours/my-itineraries/5a7e0000-0000-4000-8000-0000000000a1", { waitUntil: "networkidle" });
    const picker = page.getByRole("group", { name: "Share with friends" });
    await picker.getByLabel("Bea Santos").check();
    await picker.getByRole("button", { name: "Save sharing" }).click();
    await expect(picker.getByRole("status")).toHaveText("Shared with 1 friend.");
  });

  test("Messages has a Friends tab to start a chat with a friend", async ({ context, page }) => {
    await signInAs(context, "tourist");
    await page.goto("/tours/messages", { waitUntil: "networkidle" });
    const tabs = page.getByRole("navigation", { name: "Filter conversations" });
    await tabs.getByRole("link", { name: "Friends" }).click();
    await expect(page).toHaveURL(/kind=friends/);
    const start = page.getByRole("region", { name: "Message a friend" });
    await expect(start.getByText("Bea Santos").first()).toBeVisible();
    await expect(start.getByRole("button", { name: "Message Bea Santos" })).toBeVisible();
    await checkA11y(page, "messages friends tab");
  });

  test("the owner opening their own shared link lands on their plan", async ({ context, page }) => {
    await signInAs(context, "tourist");
    await page.goto("/tours/friends/plans/5a7e0000-0000-4000-8000-0000000000a1", { waitUntil: "networkidle" });
    await expect(page).toHaveURL(/\/tours\/my-itineraries\/5a7e0000-0000-4000-8000-0000000000a1$/);
  });
});
