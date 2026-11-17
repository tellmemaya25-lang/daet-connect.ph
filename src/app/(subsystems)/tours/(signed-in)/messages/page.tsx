import { PageBody } from "@/components/ui/signed-in-frame";
import { InboxSection } from "@/app/(subsystems)/tours/messages/inbox-view";

type PageProps = { searchParams: Promise<{ kind?: string }> };

export default function MessagesInboxPage({ searchParams }: PageProps) {
  // The heading is the same for everyone, so it is in the prerendered shell;
  // the conversations wait for the person.
  return (
    <PageBody>
      <div className="mx-auto max-w-2xl">
        <h1 className="display-2 text-daet-ink">Messages</h1>
        <p className="mt-2 text-daet-ink">Booking chats, private chats with your guide or tourists, operator–guide chats and Tourism Office support. Only the people in a chat can read it.</p>
        <InboxSection searchParams={searchParams} />
      </div>
    </PageBody>
  );
}
