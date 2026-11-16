import { expect, test } from "@playwright/test";
import { checkA11y, offScreen, signInAs, visit } from "./fixtures";

// Guides apply to operators: interview, then a % of the tour price, then the
// operator can assign them (20261207). The mock: the guide works with Bagasbas
// Coast Tours at 30%; Rosa Mendoza has just applied there; Daet Heritage Walks
// takes applications. Which guides the pickers offer is decided in the
// database (tours_guides_free_on), so it is tested there, not against the mock.

test.describe("guide applications", () => {
  test("a guide sees their share and applies to another operator", async ({ context, page }) => {
    await signInAs(context, "guide");
    await visit(page, "/tours/guide/operators", "Operators");

    const working = page.getByRole("region", { name: "You guide for" });
    await expect(working.getByText("Bagasbas Coast Tours")).toBeVisible();
    await expect(working.getByText("You guide their tours for 30% of the tour price.")).toBeVisible();

    const apply = page.getByRole("region", { name: "Apply to an operator" });
    await expect(apply.getByText("Bagasbas Coast Tours")).toHaveCount(0);
    await apply.getByRole("button", { name: "Apply to Daet Heritage Walks" }).click();
    await apply.getByLabel("Message to Daet Heritage Walks").fill("I know the old town and speak Bikol.");
    await apply.getByRole("button", { name: "Send application" }).click();
    await expect(apply.getByRole("status")).toHaveText("Application sent. The operator will set up an interview.");

    expect(await offScreen(page)).toEqual([]);
    // An action refreshes the page, and Next streams the title back in; wait for it.
    await expect(page).toHaveTitle(/\S/);
    await checkA11y(page, "guide operators");
  });

  test("an operator interviews an applicant and offers a share", async ({ context, page }) => {
    await signInAs(context, "operator");
    await visit(page, "/tours/operator/guides", "Guides");

    const applications = page.getByRole("region", { name: /Applications/ });
    const rosa = applications.getByRole("listitem").filter({ hasText: "Rosa Mendoza" });
    await expect(rosa.getByText("New application. Set up an interview, or decline.")).toBeVisible();
    await expect(rosa.getByText("I have guided surf lessons at Bagasbas for four years.")).toBeVisible();

    await rosa.getByRole("button", { name: "Set interview" }).click();
    const next = new Date(Date.now() + 3 * 86400e3 + 8 * 3600e3).toISOString().slice(0, 10);
    await rosa.getByLabel("Date and time").fill(`${next}T10:00`);
    await rosa.getByLabel("Place").fill("Bagasbas office");
    await rosa.getByRole("button", { name: "Send to the guide" }).click();
    await expect(rosa.getByRole("status")).toHaveText("Interview set. The guide was asked to confirm.");

    const team = page.getByRole("region", { name: /Your team/ });
    await expect(team.getByText("On your team at 30% of the tour price.")).toBeVisible();
    await team.getByRole("button", { name: "Offer a new share" }).click();
    const share = team.getByLabel(/share of the tour price/);
    await share.fill("101");
    await expect(team.getByText("The share must be more than 0% and at most 100%.")).toBeVisible();
    await share.fill("35");
    await expect(team.getByText(/^At 35%: ₱350\.00 on a ₱1,000\.00 tour · ₱875\.00 on a ₱2,500\.00 tour/)).toBeVisible();
    await team.getByRole("button", { name: "Send offer" }).click();
    await expect(team.getByRole("status")).toHaveText("Offer of 35% sent. It applies once the guide accepts.");

    expect(await offScreen(page)).toEqual([]);
    // An action refreshes the page, and Next streams the title back in; wait for it.
    await expect(page).toHaveTitle(/\S/);
    await checkA11y(page, "operator guides");
  });

  test("an operator manages the team: figures, who needs tours, ranking by tour, auto-assign", async ({ context, page }) => {
    await signInAs(context, "operator");
    await visit(page, "/tours/operator/guides", "Guides");

    const table = page.getByRole("table", { name: /Each guide on your team/ });
    const juan = table.getByRole("row", { name: /Juan Dela Cruz/ });
    await expect(juan).toContainText("30% share");
    await expect(juan).toContainText("₱2,400.00");
    await expect(juan).toContainText("4.8★ (9)");
    await expect(page.getByRole("heading", { name: "Top guides" }).locator("..")).toContainText("Juan Dela Cruz: 3 tours, ₱8,000.00");
    await expect(page.getByRole("heading", { name: "Not getting enough tours" }).locator("..")).toContainText("Liza Bautista: 0 tours in 30 days, 9 free days ahead");

    const ranked = page.getByRole("region", { name: "Ranked guides for this tour" });
    await expect(ranked.getByRole("listitem")).toHaveCount(1);
    await page.getByRole("region", { name: "Have led this tour" }).getByRole("button", { name: "Add Liza Bautista to this tour" }).click();
    await ranked.getByRole("button", { name: "Move Liza Bautista up" }).click();
    await expect(ranked.getByRole("listitem").first()).toContainText("Liza Bautista");
    await page.getByRole("button", { name: "Save ranking" }).click();
    await expect(page.getByText("Saved. New bookings for this tour try these guides first, in this order.")).toBeVisible();

    const toggle = page.getByRole("switch", { name: "Assign guides automatically" });
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await expect(page.getByText(/Automatic assignment is on/)).toBeVisible();

    expect(await offScreen(page)).toEqual([]);
    // An action refreshes the page, and Next streams the title back in; wait for it.
    await expect(page).toHaveTitle(/\S/);
    await checkA11y(page, "operator guide management");
  });
});
