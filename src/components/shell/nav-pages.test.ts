import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { ADMIN_GROUPS } from "@/components/admin/nav";
import { GUIDE_GROUPS } from "@/components/guide/nav";
import { OPERATOR_GROUPS } from "@/components/operator/nav";

const APP = join(process.cwd(), "src", "app");

/** Every URL that has a page.tsx, with route groups like (subsystems) left out of the path. */
function pageRoutes(dir = APP, route = ""): string[] {
  const routes: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name === "page.tsx") routes.push(route || "/");
    if (!entry.isDirectory()) continue;
    const group = /^\(.*\)$/.test(entry.name);
    routes.push(...pageRoutes(join(dir, entry.name), group ? route : `${route}/${entry.name}`));
  }
  return routes;
}

describe("sidebar links", () => {
  const routes = new Set(pageRoutes());
  const shells = { admin: ADMIN_GROUPS, operator: OPERATOR_GROUPS, guide: GUIDE_GROUPS };

  it("finds the app's pages", () => {
    expect(existsSync(APP)).toBe(true);
    expect(routes.has("/tours/admin")).toBe(true);
  });

  for (const [role, groups] of Object.entries(shells)) {
    it(`each ${role} sidebar link opens a page that exists`, () => {
      const missing = groups.flatMap((g) => g.areas).filter((a) => !routes.has(a.href)).map((a) => a.href);
      expect(missing).toEqual([]);
    });
  }
});
