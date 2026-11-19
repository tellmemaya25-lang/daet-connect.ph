import { PageFrame } from "@/components/ui/page-frame";
import { InboxSection } from "@/app/(subsystems)/tours/messages/inbox-view";

export const metadata = { title: "Messages" };

type PageProps = { searchParams: Promise<{ kind?: string }> };

/** The guide's inbox, inside the guide shell. /tours/messages sends guides here. */
export default function GuideMessagesPage({ searchParams }: PageProps) {
  return (
    <PageFrame>
      <div className="max-w-2xl">
        <h1 className="display-2 text-daet-ink">Messages</h1>
        <p className="mt-2 text-daet-ink">Booking chats, private chats with tourists, operator–guide chats and Tourism Office support. Only the people in a chat can read it.</p>
        <InboxSection searchParams={searchParams} basePath="/tours/guide/messages" />
      </div>
    </PageFrame>
  );
}
