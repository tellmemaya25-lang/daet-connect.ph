import { PageFrame } from "@/components/ui/page-frame";
import { InboxSection } from "@/app/(subsystems)/tours/messages/inbox-view";

export const metadata = { title: "Messages" };

type PageProps = { searchParams: Promise<{ kind?: string }> };

/** The operator's inbox, inside the operator shell. /tours/messages sends operators here. */
export default function OperatorMessagesPage({ searchParams }: PageProps) {
  return (
    <PageFrame>
      <div className="max-w-2xl">
        <h1 className="display-2 text-daet-ink">Messages</h1>
        <p className="mt-2 text-daet-ink">Booking chats, private chats with your guide or tourists, operator–guide chats and Tourism Office support. Only the people in a chat can read it.</p>
        <InboxSection searchParams={searchParams} basePath="/tours/operator/messages" />
      </div>
    </PageFrame>
  );
}
