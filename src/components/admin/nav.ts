import type { IconName } from "@/components/ui/icons";

export type AdminArea = { href: string; label: string; icon: IconName };

/** Only areas that exist in production. Add one here when its page ships. */
export const ADMIN_AREAS: AdminArea[] = [
  { href: "/tours/admin", label: "Dashboard", icon: "chart" },
  { href: "/tours/admin/analytics", label: "Analytics", icon: "chart" },
  { href: "/tours/admin/operators", label: "Operators", icon: "building" },
  { href: "/tours/admin/guides", label: "Guides", icon: "guide" },
  { href: "/tours/admin/packages", label: "Packages", icon: "box" },
  { href: "/tours/admin/reviews", label: "Reviews", icon: "star" },
  { href: "/tours/admin/attractions", label: "Places", icon: "pin" },
  { href: "/tours/admin/events", label: "Events", icon: "calendar" },
  { href: "/tours/admin/guide-places", label: "Food and stays", icon: "plate" },
  { href: "/tours/admin/fares", label: "Fares", icon: "ticket" },
  { href: "/tours/admin/merch", label: "Merchandise", icon: "bag" },
];

/** The area a path belongs to: the longest matching href wins, so /tours/admin only matches itself. */
export function areaFor(pathname: string): AdminArea | undefined {
  return ADMIN_AREAS.filter((a) =>
    a.href === "/tours/admin" ? pathname === a.href : pathname === a.href || pathname.startsWith(a.href + "/"),
  ).sort((x, y) => y.href.length - x.href.length)[0];
}

export const SIDEBAR_COOKIE = "admin-sidebar";
