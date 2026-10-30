import { dockClose, dockMinimize, dockOpen } from "@/components/chat-dock/dock-bus";

describe("chat dock", () => {
  it("keeps two chats open, newest first, and folds older ones into heads", () => {
    let s = { open: [] as string[], heads: [] as string[] };
    s = dockOpen(s, "a");
    s = dockOpen(s, "b");
    s = dockOpen(s, "c");
    expect(s).toEqual({ open: ["c", "b"], heads: ["a"] });
    s = dockOpen(s, "a");
    expect(s).toEqual({ open: ["a", "c"], heads: ["b"] });
  });

  it("minimizes to a head and closes completely", () => {
    let s = { open: ["a", "b"], heads: ["c"] };
    s = dockMinimize(s, "a");
    expect(s).toEqual({ open: ["b"], heads: ["a", "c"] });
    s = dockClose(s, "a");
    expect(s).toEqual({ open: ["b"], heads: ["c"] });
  });
});
