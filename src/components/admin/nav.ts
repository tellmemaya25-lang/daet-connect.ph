import type { IconName } from "@/components/ui/icons";

export type AdminArea = { href: string; label: string; icon: IconName };

const A = (href: string, label: string, icon: IconName): AdminArea => ({
  href: "/tours/admin" + href,
  label,
  icon,
});

/** Only areas that exist in production. Add one here when its page ships. */
export const ADMIN_GROUPS: { title: string; areas: AdminArea[] }[] = [
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
export function areaFor(pathname: string): AdminArea | undefined {
  return ADMIN_AREAS.filter((a) =>
    a.href === "/tours/admin"
      ? pathname === a.href
      : pathname === a.href || pathname.startsWith(a.href + "/"),
  ).sort((x, y) => y.href.length - x.href.length)[0];
}

export const SIDEBAR_COOKIE = "admin-sidebar";

/** Areas whose sidebar link shows how many items are waiting for a decision. */
export const QUEUE_HREFS = [
  "/tours/admin/operators",
  "/tours/admin/guides",
  "/tours/admin/packages",
] as const;
/** The group the sidebar lets an admin fold away. It stays open while one of its areas is the current page. */
export const COLLAPSIBLE_GROUP = "Content";
