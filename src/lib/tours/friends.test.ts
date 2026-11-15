import { cleanSearch, initials, isProfileId, parseFoundPeople, parseFriendLists, parseSharedPlans } from "@/lib/tours/friends";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

describe("friends", () => {
  it("reads the three lists and drops bad rows", () => {
    const r = parseFriendLists({ friends: [{ id: A, name: " Ana " }, { id: "x" }], incoming: [{ id: B, name: null, avatar_url: "u" }], outgoing: null });
    expect(r.friends).toEqual([{ id: A, name: "Ana", avatarUrl: null }]);
    expect(r.incoming).toEqual([{ id: B, name: "Traveller", avatarUrl: "u" }]);
    expect(r.outgoing).toEqual([]);
    expect(parseFriendLists(null)).toEqual({ friends: [], incoming: [], outgoing: [] });
  });
  it("reads search results with their status", () => {
    expect(parseFoundPeople([{ id: A, name: "Ana", status: "incoming" }, { id: B, name: "Ben", status: "weird" }]).map((p) => p.status)).toEqual(["incoming", "none"]);
  });
  it("reads plans shared with me", () => {
    expect(parseSharedPlans([{ id: A, title: "", owner: "Ana", start_date: "2026-12-01" }, { id: 3 }])).toEqual([
      { id: A, title: "Trip plan", startDate: "2026-12-01", endDate: null, owner: "Ana", sharedAt: null },
    ]);
  });
  it("only sends searches of 3 to 120 characters", () => {
    expect(cleanSearch("  an ")).toBe("");
    expect(cleanSearch(" ana ")).toBe("ana");
    expect(cleanSearch("x".repeat(121))).toBe("");
    expect(cleanSearch(undefined)).toBe("");
  });
  it("helpers", () => {
    expect(initials("Ana Maria Cruz")).toBe("AC");
    expect(initials("ana")).toBe("A");
    expect(isProfileId(A)).toBe(true);
    expect(isProfileId("nope")).toBe(false);
  });
});
