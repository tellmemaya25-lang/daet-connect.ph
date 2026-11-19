import { expect, test } from "@playwright/test";
import { signInAs, visit, type Role } from "./fixtures";

/** Sign out lives in the account menu: the avatar in the header, or the You tab for tourists and admins on phones. */
async function signOutButton(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: /^(You, y|Y)our account/ }).click();
  return page.getByRole("navigation", { name: "Your account" }).getByRole("button", { name: "Sign out" });
}

const pages: Record<Role, string[]> = {
  tourist: [
    "/tours/me",
    "/tours/my-bookings",
    "/tours/bookings/e9466de5-4877-47c1-ac14-d86deeb38b9e",
    "/tours/bookings/e9466de5-4877-47c1-ac14-d86deeb38b9e/ticket",
    "/tours/bookings/a7d1c3e2-5b4f-4c6a-9e8d-1f2a3b4c5d6e/ticket",
    "/tours/messages",
    "/tours/messages?kind=guide_tourist",
    "/tours/messages/cc110000-0000-4000-8000-000000000001",
    "/tours/notifications",
    "/tours/my-itineraries",
  ],
  operator: [
    "/tours/operator/dashboard",
    "/tours/operator/bookings",
    "/tours/operator/payments",
    "/tours/operator/scan",
    "/tours/operator/reviews",
    "/tours/operator/merch",
    "/tours/operator/merch/new",
    "/tours/operator/packages",
    "/tours/operator/packages/create",
    "/tours/operator/settings",
    "/tours/messages",
  ],
  guide: ["/tours/guide/dashboard", "/tours/guide/my-tours", "/tours/guide/check-in", "/tours/guide/my-qr", "/tours/guide/tours/e9466de5-4877-47c1-ac14-d86deeb38b9e/roster"],
  admin: [
    "/tours/admin",
    "/tours/admin/analytics",
    "/tours/admin/reviews",
    "/tours/admin/merch",
    "/tours/admin/events",
    "/tours/admin/attractions",
    "/tours/admin/operators",
    "/tours/admin/guides",
    "/tours/admin/packages",
    "/tours/messages",
  ],
};

for (const role of Object.keys(pages) as Role[]) {
  test.describe(`${role} pages`, () => {
    test.beforeEach(async ({ context }) => signInAs(context, role));
    for (const path of pages[role]) {
      test(`renders ${path}`, async ({ page }) => {
        await visit(page, path);
      });
    }
    test("navigation leads to every dashboard section", async ({ page }) => {
      await page.goto(pages[role][0], { waitUntil: "networkidle" });
      if (role === "admin") {
        // On a phone the admin's account menu is the tab bar's right-most item, not the top bar's avatar.
        const bar = page.getByRole("navigation", { name: "Dashboard" });
        await expect(bar.getByRole("link")).toHaveCount(5);
        const you = bar.getByRole("button", { name: /^You, your account/ });
        await expect(you).toBeVisible();
        expect(await bar.locator("li").last().getByRole("button").count()).toBe(1);
        const box = await you.boundingBox();
        expect(box!.width).toBeGreaterThanOrEqual(44);
        expect(box!.height).toBeGreaterThanOrEqual(44);
        await expect(page.getByRole("banner").getByRole("button", { name: /^Your account/ })).toBeHidden();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        await you.click();
        const sheet = page.getByRole("navigation", { name: "Your account" });
        await expect(sheet.getByRole("link", { name: "Profile settings" })).toBeVisible();
        await expect(sheet.getByRole("link", { name: "View public site" })).toHaveAttribute("href", "/");
        await expect(sheet.getByRole("button", { name: "Sign out" })).toBeVisible();
        await page.keyboard.press("Escape");
        // The menu still opens the drawer of admin areas.
        await page.getByRole("button", { name: "Open menu" }).click();
        const areas = page.getByRole("dialog", { name: "Admin menu" }).getByRole("navigation", { name: "Admin areas" }).getByRole("link");
        await expect(areas.first()).toHaveAttribute("aria-current", "page");
        const hrefs = await areas.evaluateAll((links) => links.map((a) => a.getAttribute("href")));
        expect(new Set(hrefs).size).toBe(hrefs.length);
        return;
      }
      const bar = page.getByRole("navigation", { name: "Dashboard" });
      const tabs = bar.getByRole("link");
      // Tourists' fifth tab is You, the account menu.
      await expect(tabs).toHaveCount(role === "tourist" ? 4 : 5);
      if (role === "tourist") await expect(bar.getByRole("button", { name: /^(You, y|Y)our account/ })).toBeVisible();
      // A tourist's Home tab leads to the landing page ("/"), and /tours/me, their dashboard, has no tab of
      // its own, so none is current there (see barTabs). Every other role's first tab is its dashboard.
      if (role === "tourist") await expect(tabs.first()).toHaveAttribute("href", "/");
      else await expect(tabs.first()).toHaveAttribute("aria-current", "page");
    });
  });
}

// Owner's note (image-94): the admin bar drew Analytics twice and reached the
// approvals queue under two names. The admin shell's sidebar must list each
// destination once, under one name.
test("the admin sidebar lists each destination once", async ({ context, page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await signInAs(context, "admin");
  await visit(page, "/tours/admin/attractions");

  const links = page.getByRole("navigation", { name: "Admin areas" }).getByRole("link");
  // A queue link also shows a count badge on its own line; the label is the first line.
  const labels = (await links.allInnerTexts()).map((t) => t.split("\n")[0]);
  const hrefs = await links.evaluateAll((a) => a.map((x) => x.getAttribute("href")));
  expect(new Set(labels).size).toBe(labels.length);
  expect(new Set(hrefs).size).toBe(hrefs.length);
  expect(labels).toEqual(expect.arrayContaining(["Analytics", "Guides", "Packages", "Places"]));
  await expect(page.getByRole("link", { name: "Places" })).toHaveAttribute("aria-current", "page");
});

test("/dashboard sends each role home", async ({ browser }) => {
  const homes: Record<Role, RegExp> = {
    tourist: /\/tours\/me$/,
    operator: /\/tours\/operator\/dashboard$/,
    guide: /\/tours\/(operator|guide)\/dashboard$/,
    admin: /\/tours\/admin$/,
  };
  for (const role of Object.keys(homes) as Role[]) {
    const context = await browser.newContext();
    await signInAs(context, role);
    const page = await context.newPage();
    await page.goto("/dashboard");
    await expect(page).toHaveURL(homes[role]);
    await context.close();
  }
});

test.describe("messaging channels", () => {
  test("tourist inbox filters by chat kind and opens a thread", async ({ context, page }) => {
    await signInAs(context, "tourist");
    await visit(page, "/tours/messages");
    const filters = page.getByRole("navigation", { name: "Filter conversations" });
    await filters.getByRole("link", { name: "Guide & tourist" }).click();
    await expect(page).toHaveURL(/kind=guide_tourist/);
    await expect(page.getByText("Maria Santos")).toBeVisible();
    await expect(page.getByText("Bagasbas Sunrise Surf Lesson")).toHaveCount(0);
  });

  test("thread labels the guide by name", async ({ context, page }) => {
    await signInAs(context, "tourist");
    await visit(page, "/tours/messages/cc110000-0000-4000-8000-000000000001");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("log", { name: "Messages" }).getByText("Maria Santos", { exact: false }).first()).toBeVisible();
  });

  test("operator can contact the Tourism Office from the dashboard", async ({ context, page }) => {
    await signInAs(context, "operator");
    await visit(page, "/tours/operator/dashboard");
    await page.getByRole("button", { name: "Contact Tourism Office" }).click();
    await expect(page).toHaveURL(/\/tours\/messages\/cc110000-0000-4000-8000-000000000001$/);
  });

  test("admin can start a chat with an operator", async ({ context, page }) => {
    await signInAs(context, "admin");
    await visit(page, "/tours/messages");
    await page.getByText("Message an operator").click();
    await expect(page.getByRole("button", { name: "Message" }).first()).toBeVisible();
  });
});

test.describe("sign out", () => {
  for (const role of ["tourist", "operator", "guide", "admin"] as Role[]) {
    test(`${role} can find Sign out in the account menu at phone width`, async ({ context, page }) => {
      await signInAs(context, role);
      await page.goto(pages[role][0], { waitUntil: "networkidle" });
      await expect(await signOutButton(page)).toBeVisible();
    });
  }

  for (const role of ["guide", "tourist"] as Role[]) {
    test(`${role}: signing out lands on the sign-in page, which says so`, async ({ context, page }) => {
      await signInAs(context, role);
      await page.goto(pages[role][0], { waitUntil: "networkidle" });
      await (await signOutButton(page)).click();
      await expect(page).toHaveURL(/\/login\?message=/);
      await expect(page.getByText("You're signed out.")).toBeVisible();
      await expect(page.getByRole("button", { name: /^(You, y|Y)our account/ })).toHaveCount(0);
    });
  }

  const framed: Array<[Role, string]> = [
    ["admin", "/tours/admin/packages"],
    ["admin", "/tours/admin/packages/aa000000-0000-4000-8000-000000000001"],
    ["operator", "/tours/operator/packages/aa000000-0000-4000-8000-000000000001/edit"],
    ["guide", "/tours/no-such-page"],
  ];
  for (const [role, path] of framed) {
    test(`${role} has Sign out on ${path}`, async ({ context, page }) => {
      await signInAs(context, role);
      await page.goto(path, { waitUntil: "networkidle" });
      await expect(await signOutButton(page)).toBeVisible();
    });
  }

  test("signed-out visitors see Sign in instead", async ({ page }) => {
    await page.goto("/tours/attractions", { waitUntil: "networkidle" });
    await expect(page.getByRole("banner").getByRole("link", { name: "Sign in" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^(You, y|Y)our account/ })).toHaveCount(0);
  });
});

test("the admin top bar searches records and Ctrl+Space focuses it", async ({ context, page }) => {
  await signInAs(context, "admin");
  await visit(page, "/tours/admin/attractions");
  await page.setViewportSize({ width: 1400, height: 900 });
  const search = page.getByRole("search").getByRole("searchbox", { name: "Search records" });
  // It rests as an icon; clicking it opens the box, and Escape folds it back.
  await page.getByRole("button", { name: "Open search" }).click();
  await expect(search).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Open search" })).toBeFocused();
  await page.keyboard.press("Control+Space");
  await expect(search).toBeFocused();
  await search.fill("bagasbas");
  // The filters live in the same search: pick a record type, then submit.
  await page.getByRole("radio", { name: "Attractions" }).click();
  await search.press("Enter");
  await expect(page).toHaveURL(/\/tours\/admin\?q=bagasbas&type=attractions/);
});

test("an admin sees the admin sidebar on messages and notifications", async ({ context, page }) => {
  await signInAs(context, "admin");
  await page.setViewportSize({ width: 1400, height: 900 });
  for (const path of ["/tours/messages", "/tours/notifications"]) {
    await visit(page, path);
    await expect(page.getByRole("navigation", { name: "Admin areas" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Open search" })).toBeVisible();
  }
});

test("an operator gets the sidebar on desktop and the menu drawer and tab bar on a phone", async ({ context, page }) => {
  await signInAs(context, "operator");
  await page.setViewportSize({ width: 1400, height: 900 });
  // Own pages and the shared ones keep one frame.
  for (const path of ["/tours/operator/dashboard", "/tours/operator/earnings", "/tours/operator/messages", "/tours/notifications"]) {
    await visit(page, path);
    await expect(page.getByRole("navigation", { name: "Operator areas" }).first()).toBeVisible();
  }
  await visit(page, "/tours/operator/earnings");
  await expect(page.getByRole("navigation", { name: "Operator areas" }).getByRole("link", { name: "Earnings" })).toHaveAttribute("aria-current", "page");
  // The top bar search goes to the bookings board.
  await page.keyboard.press("Control+Space");
  const search = page.getByRole("searchbox", { name: "Search records" });
  await expect(search).toBeFocused();
  await expect(search).toHaveAttribute("minlength", "2");
  await page.getByRole("radio", { name: "Bookings" }).click();
  await search.fill("Jane");
  await search.press("Enter");
  await expect(page).toHaveURL(/\/tours\/operator\/search\?q=Jane&type=bookings&status=all/);
  await expect(page.getByRole("heading", { name: "Results for “Jane”" })).toBeVisible();
  // The public frame is gone: no public header on desktop.
  await expect(page.getByRole("button", { name: /^Your account/ })).toBeVisible();
  // Phone: menu drawer, plus the bottom tab bar.
  await page.setViewportSize({ width: 375, height: 800 });
  await visit(page, "/tours/operator/dashboard");
  await expect(page.getByRole("navigation", { name: "Dashboard" }).getByRole("link")).toHaveCount(5);
  await page.getByRole("button", { name: "Open menu" }).click();
  const drawer = page.getByRole("dialog", { name: "Operator menu" });
  await expect(drawer.getByRole("link", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
  const noSideways = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(noSideways).toBe(true);
});

test("a guide gets the sidebar on desktop and the menu drawer and tab bar on a phone", async ({ context, page }) => {
  await signInAs(context, "guide");
  await page.setViewportSize({ width: 1400, height: 900 });
  for (const path of ["/tours/guide/dashboard", "/tours/guide/earnings", "/tours/guide/messages", "/tours/notifications"]) {
    await visit(page, path);
    await expect(page.getByRole("navigation", { name: "Guide areas" }).first()).toBeVisible();
  }
  await visit(page, "/tours/guide/earnings");
  await expect(page.getByRole("navigation", { name: "Guide areas" }).getByRole("link", { name: "Earnings" })).toHaveAttribute("aria-current", "page");
  await page.keyboard.press("Control+Space");
  const search = page.getByRole("searchbox", { name: "Search records" });
  await expect(search).toBeFocused();
  await search.fill("Jane");
  await search.press("Enter");
  await expect(page).toHaveURL(/\/tours\/guide\/search\?q=Jane/);
  await expect(page.getByRole("heading", { name: "Results for “Jane”" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Your account/ })).toBeVisible();
  await visit(page, "/tours/messages");
  await expect(page).toHaveURL(/\/tours\/guide\/messages/);
  await page.setViewportSize({ width: 375, height: 800 });
  await visit(page, "/tours/guide/dashboard");
  await expect(page.getByRole("navigation", { name: "Dashboard" }).getByRole("link")).toHaveCount(5);
  await page.getByRole("button", { name: "Open menu" }).click();
  const drawer = page.getByRole("dialog", { name: "Guide menu" });
  await expect(drawer.getByRole("link", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
  const noSideways = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(noSideways).toBe(true);
});

test("an operator has an activity log and can open a guide's earnings from the team table", async ({ context, page }) => {
  await signInAs(context, "operator");
  await page.setViewportSize({ width: 1400, height: 900 });
  await visit(page, "/tours/operator/activity");
  await expect(page.getByRole("heading", { name: "Activity log" })).toBeVisible();
  await expect(page.getByRole("cell", { name: /changed a booking/ })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Operator areas" }).getByRole("link", { name: "Activity log" })).toHaveAttribute("aria-current", "page");
  await visit(page, "/tours/operator/guides");
  await expect(page.getByRole("link", { name: "Juan Dela Cruz" }).first()).toHaveAttribute("href", /\/tours\/operator\/guides\/f66b1fe2-a997-4c0b-be13-22d62cf0dba6$/);
});

/** Opens the backup page's form, unticks what is named, downloads as JSON, and returns the saved sections. */
async function downloadBackupJson(page: import("@playwright/test").Page, untick: RegExp[] = []) {
  const section = page.getByRole("region", { name: "Data backup" });
  await expect(section.getByLabel("Format")).toHaveValue("zip");
  for (const name of untick) await section.getByRole("checkbox", { name }).uncheck();
  await section.getByLabel("Format").selectOption("json");
  const [download] = await Promise.all([page.waitForEvent("download"), section.getByRole("button", { name: "Download backup" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^connect-daet-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const body = JSON.parse(await (await import("node:fs/promises")).readFile((await download.path())!, "utf8"));
  return Object.keys(body.data);
}

test("an operator saves their data from Data backup in the sidebar", async ({ context, page }) => {
  await signInAs(context, "operator");
  await page.setViewportSize({ width: 1400, height: 900 });
  await visit(page, "/tours/operator/dashboard");
  await page.getByRole("navigation", { name: "Operator areas" }).getByRole("link", { name: "Data backup" }).click();
  await expect(page).toHaveURL(/\/tours\/operator\/backup$/);
  const section = page.getByRole("region", { name: "Data backup" });
  await expect(section.getByRole("checkbox")).toHaveCount(6);
  await expect(section.getByRole("checkbox", { name: /Bookings/ })).toBeChecked();
  expect(await downloadBackupJson(page, [/Payments/])).toEqual(["bookings", "packages", "guides", "merchandise", "reviews"]);
  // Nothing ticked is refused, and the zip is a real archive.
  expect((await page.request.get("/tours/operator/backup/download")).status()).toBe(400);
  const zip = await page.request.get("/tours/operator/backup/download?items=packages&items=reviews&format=zip");
  expect(zip.headers()["content-type"]).toContain("application/zip");
  expect((await zip.body()).subarray(0, 2).toString()).toBe("PK");
});

test("a guide saves their own work from Data backup in the sidebar", async ({ context, page }) => {
  await signInAs(context, "guide");
  await page.setViewportSize({ width: 1400, height: 900 });
  await visit(page, "/tours/guide/dashboard");
  await page.getByRole("navigation", { name: "Guide areas" }).getByRole("link", { name: "Data backup" }).click();
  await expect(page).toHaveURL(/\/tours\/guide\/backup$/);
  const section = page.getByRole("region", { name: "Data backup" });
  await expect(section.getByRole("checkbox")).toHaveCount(4);
  expect(await downloadBackupJson(page, [/Availability/])).toEqual(["tours", "operators", "reviews"]);
  // An operator may not use the guide's download.
  const other = await context.browser()!.newContext();
  await signInAs(other, "operator");
  expect((await other.request.get("/tours/guide/backup/download?items=tours")).status()).toBe(403);
  await other.close();
});

test("an admin saves records from Data backup in the sidebar, with the personal ones off by default", async ({ context, page }) => {
  await signInAs(context, "admin");
  await page.setViewportSize({ width: 1400, height: 900 });
  await visit(page, "/tours/admin");
  await page.getByRole("navigation", { name: "Admin areas" }).getByRole("link", { name: "Data backup" }).click();
  await expect(page).toHaveURL(/\/tours\/admin\/backup$/);
  const section = page.getByRole("region", { name: "Data backup" });
  await expect(section.getByRole("checkbox")).toHaveCount(15);
  await expect(section.getByRole("checkbox", { name: /Accounts and roles/ })).not.toBeChecked();
  await expect(section.getByRole("checkbox", { name: /Activity log/ })).not.toBeChecked();
  expect(await downloadBackupJson(page, [/Bookings/, /Payments/, /Reports/])).toEqual([
    "packages", "operators", "guides", "attractions", "events", "places", "fares", "merchandise", "emergency", "reviews",
  ]);
  // Only an admin may use the admin download.
  const other = await context.browser()!.newContext();
  await signInAs(other, "operator");
  expect((await other.request.get("/tours/admin/backup/download?items=operators")).status()).toBe(403);
  await other.close();
});

test("the admin top bar has notifications, and the account menu has messages and the public site", async ({ context, page }) => {
  await signInAs(context, "admin");
  await visit(page, "/tours/admin");
  await page.setViewportSize({ width: 1400, height: 900 });
  // Desktop has no tab bar, so the avatar stays in the top bar.
  await expect(page.getByRole("navigation", { name: "Dashboard" })).toBeHidden();
  await page.getByRole("banner").getByRole("button", { name: /^Your account/ }).click();
  await expect(page.getByRole("link", { name: "Messages" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "View public site" })).toHaveAttribute("href", "/");
  await page.keyboard.press("Escape");
  const bell = page.getByRole("button", { name: /^Notifications/ });
  await bell.click();
  await expect(page.getByText("Notifications", { exact: true })).toBeVisible();
});
