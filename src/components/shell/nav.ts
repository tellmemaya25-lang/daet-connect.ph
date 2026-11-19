import type { IconName } from "@/components/ui/icons";

/** One sidebar link. `exact` links only match their own path (a dashboard that is the parent of the other areas). */
export type NavArea = {
  href: string;
  label: string;
  icon: IconName;
  exact?: boolean;
};
export type NavGroup = { title: string; areas: NavArea[] };

/** What differs between one role's shell and another's. Plain data, so a server component can pass it down. */
export type ShellConfig = {
  /** Names the landmarks: "Admin" gives "Admin menu" and "Admin areas". */
  label: string;
  /** Where the wordmark goes. */
  homeHref: string;
  groups: NavGroup[];
  /** Cookie that remembers the collapsed sidebar, and the path it is scoped to. */
  cookie: { name: string; path: string };
  /** The group the sidebar lets a person fold away. It stays open while one of its areas is current. */
  collapsibleGroup?: string;
};

/** The area a path belongs to: the longest matching href wins. */
export function findArea(
  groups: NavGroup[],
  pathname: string,
): NavArea | undefined {
  return groups
    .flatMap((g) => g.areas)
    .filter((a) =>
      a.exact
        ? pathname === a.href
        : pathname === a.href || pathname.startsWith(a.href + "/"),
    )
    .sort((x, y) => y.href.length - x.href.length)[0];
}
