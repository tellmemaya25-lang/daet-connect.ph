import type { NavGroup, ShellConfig } from "@/components/shell/nav";
import { findArea } from "@/components/shell/nav";

const base = "/tours/operator";

/** Only areas that exist in production. Add one here when its page ships. */
export const OPERATOR_GROUPS: NavGroup[] = [
  {
    title: "Main",
    areas: [
      { href: `${base}/dashboard`, label: "Dashboard", icon: "dashboard" },
      { href: `${base}/bookings`, label: "Bookings", icon: "ticket" },
      { href: `${base}/live`, label: "Live", icon: "pin" },
      { href: `${base}/scan`, label: "Scan QR", icon: "camera" },
    ],
  },
  {
    title: "Catalogue",
    areas: [
      { href: `${base}/packages`, label: "Packages", icon: "box" },
      { href: `${base}/guides`, label: "Guides", icon: "guide" },
      { href: `${base}/merch`, label: "Merchandise", icon: "bag" },
    ],
  },
  {
    title: "Money",
    areas: [
      { href: `${base}/payments`, label: "Payments", icon: "receipt" },
      { href: `${base}/earnings`, label: "Earnings", icon: "money" },
    ],
  },
  {
    title: "Account",
    areas: [
      { href: `${base}/reviews`, label: "Reviews", icon: "star" },
      { href: `${base}/activity`, label: "Activity log", icon: "note" },
      { href: `${base}/messages`, label: "Messages", icon: "message" },
      { href: `${base}/backup`, label: "Data backup", icon: "download" },
      { href: `${base}/settings`, label: "Settings", icon: "gear" },
    ],
  },
];

export const OPERATOR_SIDEBAR_COOKIE = "operator-sidebar";

export const OPERATOR_SHELL: ShellConfig = {
  label: "Operator",
  homeHref: `${base}/dashboard`,
  groups: OPERATOR_GROUPS,
  cookie: { name: OPERATOR_SIDEBAR_COOKIE, path: base },
};

export const operatorAreaFor = (pathname: string) =>
  findArea(OPERATOR_GROUPS, pathname);
