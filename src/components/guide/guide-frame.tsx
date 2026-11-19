import type { ReactNode } from "react";
import { GUIDE_SHELL } from "@/components/guide/nav";
import { GuideSearch } from "@/components/guide/guide-search";
import { RoleFrame, type FrameViewer } from "@/components/shell/role-frame";
import type { loadNotifications } from "@/lib/tours/notifications-server";

/** The guide sidebar and top bar around a page. PageFrame uses it for a guide on every signed-in page. */
export function GuideFrame({
  viewer,
  notifications,
  children,
}: {
  viewer: FrameViewer;
  notifications: Awaited<ReturnType<typeof loadNotifications>>;
  children: ReactNode;
}) {
  return (
    <RoleFrame role="guide" config={GUIDE_SHELL} viewer={viewer} notifications={notifications} search={<GuideSearch />}>
      {children}
    </RoleFrame>
  );
}
