import { AdminPage } from "@/components/admin/admin-page";
import { InboxSection } from "@/app/(subsystems)/tours/messages/inbox-view";

type PageProps = { searchParams: Promise<{ kind?: string }> };

/** The Tourism Office inbox, inside the admin shell. /tours/messages sends admins here. */
export default function AdminMessagesPage({ searchParams }: PageProps) {
  return (
    <AdminPage>
      <div className="max-w-2xl">
        <h1 className="display-2 text-daet-ink">Messages</h1>
        <p className="mt-2 text-daet-ink">Booking chats, private chats with your guide or tourists, operator–guide chats and Tourism Office support. Only the people in a chat can read it.</p>
        <InboxSection searchParams={searchParams} basePath="/tours/admin/messages" />
      </div>
    </AdminPage>
  );
}
