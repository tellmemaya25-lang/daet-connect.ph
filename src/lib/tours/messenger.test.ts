import {
  applyReaction,
  bubbleCorners,
  quotePreview,
  reactionSummary,
  seenMessageId,
  threadItems,
  toggledReaction,
  whoIsTyping,
  type Reaction,
  type ThreadMessage,
} from "@/lib/tours/messenger";

const msg = (id: string, sender: string, at: string, over: Partial<ThreadMessage> = {}): ThreadMessage => ({
  id,
  sender_id: sender,
  message_text: id,
  attachment_url: null,
  created_at: at,
  ...over,
});

describe("Messenger-style threads", () => {
  const me = "me";
  const messages = [
    msg("a", "you", "2026-10-29T01:00:00Z"),
    msg("b", "you", "2026-10-29T01:01:00Z"),
    msg("c", "you", "2026-10-29T01:02:00Z"),
    msg("d", me, "2026-10-29T01:03:00Z"),
    msg("e", me, "2026-10-29T01:30:00Z"),
    msg("f", "you", "2026-10-30T01:00:00Z"),
  ];

  it("groups runs from the same sender, splitting on day changes and long gaps", () => {
    const items = threadItems(messages, me);
    const view = items.map((i) => (i.type === "day" ? `[${i.label.length > 0 ? "day" : ""}]` : `${i.message.id}:${i.position}${i.showSender ? "+name" : ""}${i.showTime ? "+time" : ""}`));
    expect(view).toEqual(["[day]", "a:first+name", "b:middle", "c:last+time", "d:single+time", "e:single+time", "[day]", "f:single+name+time"]);
  });

  it("rounds corners like Messenger", () => {
    expect(bubbleCorners("single", true)).toBe("rounded-2xl");
    expect(bubbleCorners("first", true)).toBe("rounded-2xl rounded-br-md");
    expect(bubbleCorners("middle", false)).toBe("rounded-2xl rounded-l-md");
    expect(bubbleCorners("last", false)).toBe("rounded-2xl rounded-tl-md");
  });

  it("shows Seen under my latest message once someone read past it", () => {
    expect(seenMessageId(messages, me, [{ profile_id: "you", last_read_at: "2026-10-29T01:40:00Z" }])).toBe("e");
    expect(seenMessageId(messages, me, [{ profile_id: "you", last_read_at: "2026-10-29T01:10:00Z" }])).toBeNull();
    expect(seenMessageId(messages, me, [])).toBeNull();
    const pending = [...messages, msg("g", me, "2026-10-30T02:00:00Z", { status: "sending" })];
    expect(seenMessageId(pending, me, [{ profile_id: "you", last_read_at: "2026-10-31T00:00:00Z" }])).toBe("e");
  });

  it("keeps one reaction per person, and tapping the same one removes it", () => {
    let reactions: Reaction[] = [{ message_id: "a", profile_id: "you", reaction: "love" }];
    reactions = applyReaction(reactions, { message_id: "a", profile_id: me, reaction: "love" });
    reactions = applyReaction(reactions, { message_id: "a", profile_id: "x", reaction: "like" });
    expect(reactionSummary(reactions, "a", me)).toEqual([
      { key: "love", count: 2, mine: true },
      { key: "like", count: 1, mine: false },
    ]);
    expect(toggledReaction(reactions, "a", me, "love")).toBeNull();
    expect(toggledReaction(reactions, "a", me, "haha")).toBe("haha");
    reactions = applyReaction(reactions, { message_id: "a", profile_id: me, reaction: null });
    expect(reactionSummary(reactions, "a", me)).toEqual([
      { key: "like", count: 1, mine: false },
      { key: "love", count: 1, mine: false },
    ]);
  });

  it("previews quoted messages and expires typing pings", () => {
    expect(quotePreview({ message_text: "  Meet at   the plaza ", attachment_url: null })).toBe("Meet at the plaza");
    expect(quotePreview({ message_text: null, attachment_url: "x/y.jpg" })).toBe("Photo");
    expect(quotePreview(null)).toBe("Original message not available");
    expect(quotePreview({ message_text: "x".repeat(100), attachment_url: null })).toHaveLength(80);
    expect(whoIsTyping({ you: 2000, me: 9000, old: 500 }, 1000, "me")).toEqual(["you"]);
  });
});
