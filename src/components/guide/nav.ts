import type { NavGroup, ShellConfig } from "@/components/shell/nav";
import { findArea } from "@/components/shell/nav";

const base = "/tours/guide";

/** Only areas that exist in production. Add one here when its page ships. */
export const GUIDE_GROUPS: NavGroup[] = [
  {
    title: "Main",
    areas: [
      { href: `${base}/dashboard`, label: "Dashboard", icon: "dashboard" },
      { href: `${base}/my-tours`, label: "My tours", icon: "ticket" },
      { href: `${base}/check-in`, label: "Scan check-in", icon: "camera" },
    ],
  },
  {
    title: "Profile",
    areas: [
      { href: `${base}/my-qr`, label: "My QR badge", icon: "idcard" },
      { href: `${base}/operators`, label: "Operators", icon: "building" },
      { href: `${base}/activity`, label: "Activity log", icon: "note" },
      { href: `${base}/messages`, label: "Messages", icon: "message" },
    ],
  },
  {
    title: "Money",
    areas: [{ href: `${base}/earnings`, label: "Earnings", icon: "money" }],
  },
];

export const GUIDE_SIDEBAR_COOKIE = "guide-sidebar";

export const GUIDE_SHELL: ShellConfig = {
  label: "Guide",
  homeHref: `${base}/dashboard`,
  groups: GUIDE_GROUPS,
  cookie: { name: GUIDE_SIDEBAR_COOKIE, path: base },
};

export const guideAreaFor = (pathname: string) => findArea(GUIDE_GROUPS, pathname);
