import {
  guideStatusText,
  interviewTimeText,
  manilaLocalToIso,
  operatorStatusText,
  parseApplications,
  parseSharePct,
  pctText,
  shareOf,
} from "@/lib/tours/guide-applications";

const row = (over: Record<string, unknown> = {}) => ({
  id: "a1",
  guide_id: "g1",
  operator_id: "o1",
  status: "applied",
  message: "I know Bagasbas.",
  interview_at: null,
  interview_place: null,
  interview_link: null,
  interview_confirmed_at: null,
  interview_notes: null,
  revenue_share_pct: null,
  offered_share_pct: null,
  decided_note: null,
  updated_at: "2026-11-14T00:00:00Z",
  ...over,
});

describe("parseApplications", () => {
  it("reads rows, numbers from strings, and drops unknown statuses", () => {
    const [a, ...rest] = parseApplications([row({ status: "active", revenue_share_pct: "35.00", interview_confirmed_at: "2026-11-14T01:00:00Z" }), row({ id: "x", status: "weird" }), null]);
    expect(rest).toEqual([]);
    expect(a).toMatchObject({ id: "a1", status: "active", sharePct: 35, offeredPct: null, interviewConfirmed: true, message: "I know Bagasbas." });
  });
});

describe("share", () => {
  it("formats and works out the guide's pay", () => {
    expect(pctText(35)).toBe("35%");
    expect(pctText(12.5)).toBe("12.5%");
    expect(shareOf(35, 2400)).toBe(840);
    expect(shareOf(12.5, 999)).toBe(124.88);
    expect(shareOf(30, -5)).toBe(0);
  });

  it("accepts a share between 0 and 100 with up to two decimals", () => {
    expect(parseSharePct("30")).toEqual({ ok: true, value: 30 });
    expect(parseSharePct(" 12.5% ")).toEqual({ ok: true, value: 12.5 });
    expect(parseSharePct("100")).toEqual({ ok: true, value: 100 });
    expect(parseSharePct("0").ok).toBe(false);
    expect(parseSharePct("101").ok).toBe(false);
    expect(parseSharePct("12.345").ok).toBe(false);
    expect(parseSharePct("thirty").ok).toBe(false);
  });
});

describe("status text", () => {
  const parse = (over: Record<string, unknown>) => parseApplications([row(over)])[0];
  it("tells the guide what's next", () => {
    expect(guideStatusText(parse({ status: "interview_scheduled" }))).toMatch(/Please confirm/);
    expect(guideStatusText(parse({ status: "offered", offered_share_pct: 30 }))).toBe("Offer: 30% of the tour price.");
    expect(guideStatusText(parse({ status: "active", revenue_share_pct: null }))).toMatch(/fixed guide fee/);
  });
  it("tells the operator what's next", () => {
    expect(operatorStatusText(parse({ status: "applied" }))).toMatch(/Set up an interview/);
    expect(operatorStatusText(parse({ status: "active", revenue_share_pct: 40 }))).toBe("On your team at 40% of the tour price.");
  });
});

describe("interview time", () => {
  it("reads the picker's value as Manila time", () => {
    expect(manilaLocalToIso("2026-12-01T14:30")).toBe("2026-12-01T06:30:00.000Z");
    expect(manilaLocalToIso("2026-12-01T03:00")).toBe("2026-11-30T19:00:00.000Z");
    expect(manilaLocalToIso("2026-02-30T10:00")).toBeNull();
    expect(manilaLocalToIso("tomorrow")).toBeNull();
  });
  it("shows it in Manila time", () => {
    expect(interviewTimeText("2026-12-01T06:30:00.000Z")).toMatch(/Dec 1.*2:30/);
  });
});
