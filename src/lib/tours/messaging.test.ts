import { attachmentPath, dayLabel, mergeMessages, messageTime, parseMessageForm, senderLabel, type ChatMessage } from "@/lib/tours/messaging";

function form(values: Record<string, string | File>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.append(key, value);
  return data;
}
const photo = (type = "image/png", size = 10) => new File([new Uint8Array(size)], "p", { type });

describe("parseMessageForm", () => {
  it("accepts text, a photo, or both", () => {
    expect(parseMessageForm(form({ text: "  Hello  " }))).toEqual({ ok: true, data: { text: "Hello", file: null, extension: null } });
    const onlyPhoto = parseMessageForm(form({ text: "", attachment: photo("image/webp") }));
    expect(onlyPhoto.ok && onlyPhoto.data.extension).toBe("webp");
    expect(onlyPhoto.ok && onlyPhoto.data.text).toBeNull();
  });

  it("rejects empty, too long, wrong type and too large", () => {
    expect(parseMessageForm(form({ text: "   " })).ok).toBe(false);
    expect(parseMessageForm(form({ text: "x".repeat(1001) })).ok).toBe(false);
    expect(parseMessageForm(form({ text: "x".repeat(1000) })).ok).toBe(true);
    expect(parseMessageForm(form({ attachment: photo("application/pdf") })).ok).toBe(false);
    expect(parseMessageForm(form({ attachment: photo("image/jpeg", 5 * 1024 * 1024 + 1) })).ok).toBe(false);
  });

  it("ignores an empty file input", () => {
    expect(parseMessageForm(form({ text: "hi", attachment: new File([], "") }))).toEqual({ ok: true, data: { text: "hi", file: null, extension: null } });
  });
});

describe("attachmentPath", () => {
  it("matches the database's expected shape", () => {
    const conv = "9b7e5a5e-0000-4000-8000-000000000001";
    const path = attachmentPath(conv, "jpg");
    expect(path).toMatch(new RegExp(`^${conv}/[0-9a-f-]{36}\\.jpg$`));
  });
});

describe("senderLabel", () => {
  const members = { touristId: "t", touristName: "Juan", operatorProfileId: "o", operatorName: "Bagasbas Tours", guideProfileId: "g" };
  it("labels each party", () => {
    expect(senderLabel("t", "t", members)).toBe("You");
    expect(senderLabel("t", "o", members)).toBe("Juan");
    expect(senderLabel("o", "t", members)).toBe("Bagasbas Tours");
    expect(senderLabel("g", "t", members)).toBe("Your guide");
    expect(senderLabel("x", "t", members)).toBe("CONNECT-Daet");
  });
});

describe("mergeMessages", () => {
  const m = (id: string, at: string): ChatMessage => ({ id, sender_id: "s", message_text: id, attachment_url: null, created_at: at });
  it("dedupes and orders by time", () => {
    const merged = mergeMessages([m("b", "2026-10-23T02:00:00Z"), m("a", "2026-10-23T01:00:00Z")], [m("b", "2026-10-23T02:00:00Z"), m("c", "2026-10-23T03:00:00Z")]);
    expect(merged.map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("orders Realtime's Postgres timestamps together with ISO ones", () => {
    const merged = mergeMessages([m("iso", "2026-10-23T02:00:00.000Z")], [m("pg", "2026-10-23 01:30:00.5+00"), m("pg2", "2026-10-23 10:30:00+08")]);
    expect(merged.map((x) => x.id)).toEqual(["pg", "iso", "pg2"]);
  });
});

describe("messageTime", () => {
  it("parses ISO and Postgres text timestamps", () => {
    expect(messageTime("2026-10-23 13:49:50.767+00")).toBe(Date.parse("2026-10-23T13:49:50.767Z"));
    expect(messageTime("2026-10-23T13:49:50.767+00:00")).toBe(Date.parse("2026-10-23T13:49:50.767Z"));
    expect(messageTime("nonsense")).toBe(0);
  });
});

describe("dayLabel", () => {
  const now = new Date("2026-10-23T04:00:00Z"); // noon in Manila
  it("uses Manila days", () => {
    expect(dayLabel("2026-10-22T16:30:00Z", now)).toBe("Today"); // 00:30 Manila on the 23rd
    expect(dayLabel("2026-10-22T15:59:00Z", now)).toBe("Yesterday");
    expect(dayLabel("2026-10-01T04:00:00Z", now)).toContain("Oct");
  });
});
