import type { IconName } from "@/components/ui/icons";
import { findArea, type NavArea, type NavGroup, type ShellConfig } from "@/components/shell/nav";

export type AdminArea = NavArea;

const A = (href: string, label: string, icon: IconName): AdminArea => ({
  href: "/tours/admin" + href,
  label,
  icon,
  exact: href === "",
});

/** Only areas that exist in production. Add one here when its page ships. */
export const ADMIN_GROUPS: NavGroup[] = [
  {
    title: "Main",
    areas: [
      A("", "Dashboard", "dashboard"),
      A("/analytics", "Analytics", "chart"),
      A("/activity", "Activity log", "receipt"),
    ],
  },
  {
    title: "Queues",
    areas: [
      A("/operators", "Operators", "building"),
      A("/guides", "Guides", "guide"),
      A("/packages", "Packages", "box"),
    ],
  },
  {
    title: "People",
    areas: [
      A("/accounts", "Accounts and roles", "user"),
      A("/guide-assignments", "Guide assignments", "guide"),
    ],
  },
  {
    title: "Content",
    areas: [
      A("/attractions", "Places", "pin"),
      A("/events", "Events", "calendar"),
      A("/guide-places", "Food and stays", "plate"),
      A("/fares", "Fares", "ticket"),
      A("/merch", "Merchandise", "bag"),
      A("/emergency", "Emergency numbers", "phone"),
    ],
  },
  {
    title: "Moderation",
    areas: [
      A("/reviews", "Reviews", "star"),
      A("/reports", "Reports", "warning"),
      A("/feedback", "Assistant feedback", "message"),
    ],
  },
  { title: "Money", areas: [A("/earnings", "Earnings and revenue", "money")] },
];

export const ADMIN_AREAS: AdminArea[] = ADMIN_GROUPS.flatMap((g) => g.areas);

/** The area a path belongs to: the longest matching href wins, so /tours/admin only matches itself. */
export const areaFor = (pathname: string) => findArea(ADMIN_GROUPS, pathname);

export const SIDEBAR_COOKIE = "admin-sidebar";

/** Areas whose sidebar link shows how many items are waiting for a decision. */
export const QUEUE_HREFS = [
  "/tours/admin/operators",
  "/tours/admin/guides",
  "/tours/admin/packages",
] as const;
/** The group the sidebar lets an admin fold away. It stays open while one of its areas is the current page. */
export const COLLAPSIBLE_GROUP = "Content";

export const ADMIN_SHELL: ShellConfig = {
  label: "Admin",
  homeHref: "/tours/admin",
  groups: ADMIN_GROUPS,
  cookie: { name: SIDEBAR_COOKIE, path: "/tours/admin" },
  collapsibleGroup: COLLAPSIBLE_GROUP,
};
