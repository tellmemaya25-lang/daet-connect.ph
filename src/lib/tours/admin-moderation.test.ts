import {
  banDuration,
  cancellationRate,
  describeActivity,
  isReportReason,
  methodLabel,
  parseActivity,
  parseAdminRevenue,
  parseReports,
  parseReviewWatch,
  reasonLabel,
} from "@/lib/tours/admin-moderation";

const ID = "11111111-1111-4111-8111-111111111111";

describe("reports", () => {
  it("reads the queue with each target's summary", () => {
    const [r, ...rest] = parseReports([
      { id: ID, type: "review", target_id: ID, reason: "fake", status: "open", reporter: "Ana", target_name: "Ben", target_role: "tourist", open_on_target: "2", summary: { rating: 1, comment: "Awful", hidden: false, about: "Kalmado" } },
      { id: "nope", type: "review" },
      { id: ID, type: "weird" },
    ]);
    expect(rest).toEqual([]);
    expect(r).toMatchObject({ type: "review", reporter: "Ana", openOnTarget: 2, review: { rating: 1, about: "Kalmado" }, pkg: null });
    expect(parseReports([{ id: ID, type: "package", summary: { title: "Calaguas" } }])[0].pkg).toEqual({ title: "Calaguas", status: "" });
  });
  it("labels reasons and ban lengths", () => {
    expect(reasonLabel("scam")).toMatch(/outside the app/);
    expect(isReportReason("spam")).toBe(true);
    expect(isReportReason("hate")).toBe(false);
    expect(banDuration(7)).toBe("168h");
    expect(banDuration(null)).toBe("876000h");
  });
});

describe("review watch", () => {
  it("reads operators, guides and low reviews", () => {
    const w = parseReviewWatch({ operators: [{ id: "o1", name: "Kalmado", reviews: 10, average: "3.4", low: 3, open_reports: 1 }], guides: [], low_reviews: [{ id: "r1", rating: 2, package: "Surf" }] });
    expect(w.operators[0]).toMatchObject({ name: "Kalmado", average: 3.4, low: 3, openReports: 1 });
    expect(w.lowReviews[0]).toMatchObject({ rating: 2, pkg: "Surf", operator: "Operator" });
    expect(parseReviewWatch(null)).toEqual({ operators: [], guides: [], lowReviews: [] });
  });
});

describe("revenue", () => {
  it("reads totals and sorts months", () => {
    const r = parseAdminRevenue({
      booked: "57124.00",
      collected: 90814,
      months: [{ month: "2026-11", booked: 1 }, { month: "2026-10", booked: 2 }, { month: "x" }],
      statuses: [{ status: "confirmed", count: 8 }, { status: "cancelled", count: 2 }],
      methods: [{ method: "gcash", count: 26, amount: "86994" }],
    });
    expect(r.booked).toBe(57124);
    expect(r.months.map((m) => m.month)).toEqual(["2026-10", "2026-11"]);
    expect(cancellationRate(r.statuses)).toBe(20);
    expect(cancellationRate([])).toBe(0);
    expect(methodLabel("gcash")).toBe("GCash");
    expect(methodLabel("bank_deposit")).toBe("Bank deposit");
  });
});

describe("activity", () => {
  const [update, insert, admin, wide] = parseActivity([
    { id: "1", at: "2026-11-15T00:00:00Z", actor_role: "operator", action: "update", entity: "tours_bookings", changes: { status: "confirmed", assigned_guide_id: null } },
    { id: "2", at: "2026-11-15T00:00:00Z", action: "insert", entity: "tours_reports", changes: {} },
    { id: "a3", at: "2026-11-15T00:00:00Z", actor_role: "admin", action: "ban_user", entity: "admin_action", notes: "Spam" },
    { id: "4", at: "2026-11-15T00:00:00Z", action: "update", entity: "tours_packages", changes: { _columns: ["title", "description"] } },
    { id: "5" },
  ]);
  it("drops rows without an id or time", () => {
    expect(parseActivity([{ id: "5" }])).toEqual([]);
    expect(insert.actorRole).toBe("system");
  });
  it("describes each entry in one line", () => {
    expect(describeActivity(update)).toBe("changed a booking: status → confirmed, assigned guide id → empty");
    expect(describeActivity(insert)).toBe("created a report");
    expect(describeActivity(admin)).toBe("ban user: Spam");
    expect(describeActivity(wide)).toBe("changed a package: title, description");
  });
});

describe("activity labels", () => {
  const base = { id: "1", at: "2026-11-15T01:00:00Z", actorRole: "system", actorName: null, action: "insert", changes: {}, notes: null };
  it("names the record behind an entry, including admin actions", async () => {
    const { entryRef, entryActorId } = await import("@/lib/tours/activity-labels");
    expect(entryRef({ entity: "tours_bookings", entityId: ID })).toEqual({ table: "tours_bookings", id: ID });
    expect(entryRef({ entity: "admin_action", entityId: `user:${ID}` })).toEqual({ table: "profiles", id: ID });
    expect(entryRef({ entity: "tours_bookings", entityId: "b1" })).toBeNull();
    expect(entryActorId({ actorId: null, changes: { recorded_by: ID } })).toBe(ID);
    expect(entryActorId({ actorId: null, changes: {} })).toBeNull();
    expect(base.id).toBe("1");
  });
});
