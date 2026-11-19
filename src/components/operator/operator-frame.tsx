import type { ReactNode } from "react";
import { OPERATOR_SHELL } from "@/components/operator/nav";
import { OperatorSearch } from "@/components/operator/operator-search";
import { RoleFrame, type FrameViewer } from "@/components/shell/role-frame";
import type { loadNotifications } from "@/lib/tours/notifications-server";

/**
 * The operator sidebar and top bar around a page. PageFrame uses it for an approved
 * operator on every signed-in page, so an operator sees one frame everywhere.
 */
export function OperatorFrame({
  viewer,
  notifications,
  children,
}: {
  viewer: FrameViewer;
  notifications: Awaited<ReturnType<typeof loadNotifications>>;
  children: ReactNode;
}) {
  return (
    <RoleFrame
      role="operator"
      config={OPERATOR_SHELL}
      viewer={viewer}
      notifications={notifications}
      search={<OperatorSearch />}
    >
      {children}
    </RoleFrame>
  );
}
