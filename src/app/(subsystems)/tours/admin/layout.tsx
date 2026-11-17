import type { ReactNode } from "react";
import { AdminFrame } from "@/components/admin/admin-frame";
import { PageFrame, signedInViewer } from "@/components/ui/page-frame";
import { loadNotifications } from "@/lib/tours/notifications-server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getAuthenticatedSession } from "@/lib/tours/server-auth";

/**
 * Admins get the admin shell. Everyone else (signed out, other roles, no Supabase)
 * gets the public frame around the page's own sign-in or access notice.
 * Each page still checks access itself: this only picks the frame.
 */
export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = isSupabaseConfigured()
    ? await getAuthenticatedSession().catch(() => null)
    : null;
  if (!session?.user || session.role !== "admin")
    return <PageFrame>{children}</PageFrame>;
  const [viewer, notifications] = await Promise.all([
    signedInViewer(),
    loadNotifications(),
  ]);
  return (
    <AdminFrame
      viewer={
        viewer ?? {
          initial: "A",
          name: session.user.email ?? "Admin",
          avatarUrl: null,
        }
      }
      notifications={notifications}
    >
      {children}
    </AdminFrame>
  );
}
