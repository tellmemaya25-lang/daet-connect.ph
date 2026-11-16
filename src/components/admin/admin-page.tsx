import type { ReactNode } from "react";

/** An admin page's content. The admin shell (tours/admin/layout.tsx) supplies the frame around it. */
export function AdminPage({
  children,
}: {
  children: ReactNode;
  adminNav?: boolean;
}) {
  return <>{children}</>;
}
