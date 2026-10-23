import { csvCell, ledgerMethodLabel, ledgerToCsv, monthRangeUtc, summarizeLedger, type LedgerRow } from "@/lib/tours/ledger";

const row = (overrides: Partial<LedgerRow>): LedgerRow => ({
  id: "p1",
  amount: "1000.00",
  payment_method: "gcash",
  provider: "manual",
  provider_method: null,
  payment_status: "completed",
  reference_number: "REF1",
  payment_date: "2026-10-23T02:00:00Z",
  notes: null,
  booking_reference: "BK-1",
  tourist_name: "Maya Santos",
  package_title: "Bagasbas Surf",
  ...overrides,
});

describe("summarizeLedger", () => {
  it("totals completed payments by channel and method; refunds separately", () => {
    const summary = summarizeLedger([
      row({ id: "a", amount: "1000.00" }),
      row({ id: "b", amount: 500.5, provider: "paymongo", provider_method: "card", payment_method: "credit_card" }),
      row({ id: "c", amount: "200", payment_method: "cash" }),
      row({ id: "d", amount: "300", payment_status: "refunded" }),
      row({ id: "e", amount: "999", payment_status: "pending" }),
    ]);
    expect(summary).toEqual({
      received: 1700.5,
      refunded: 300,
      count: 3,
      online: 500.5,
      manual: 1200,
      byMethod: [
        { method: "GCash", amount: 1000 },
        { method: "Card", amount: 500.5 },
        { method: "Cash", amount: 200 },
      ],
    });
  });

  it("avoids floating point drift", () => {
    const summary = summarizeLedger([row({ amount: 0.1 }), row({ amount: 0.2 })]);
    expect(summary.received).toBe(0.3);
  });
});

describe("ledgerMethodLabel", () => {
  it("uses the exact PayMongo method for online payments", () => {
    expect(ledgerMethodLabel({ provider: "paymongo", provider_method: "paymaya", payment_method: "other" })).toBe("Maya");
    expect(ledgerMethodLabel({ provider: "manual", provider_method: null, payment_method: "bank_transfer" })).toBe("Bank transfer");
  });
});

describe("monthRangeUtc", () => {
  it("covers the Manila month", () => {
    expect(monthRangeUtc({ year: 2026, month: 10 })).toEqual({
      startIso: "2026-09-30T16:00:00.000Z",
      endIso: "2026-10-31T16:00:00.000Z",
    });
    expect(monthRangeUtc({ year: 2026, month: 12 }).endIso).toBe("2026-12-31T16:00:00.000Z");
  });
});

describe("CSV export", () => {
  it("quotes commas, quotes and newlines", () => {
    expect(csvCell('Santos, "Maya"')).toBe('"Santos, ""Maya"""');
    expect(csvCell("line\nbreak")).toBe('"line\nbreak"');
    expect(csvCell(null)).toBe("");
  });

  it("neutralizes spreadsheet formulas from user input", () => {
    expect(csvCell("=HYPERLINK(\"http://evil\")")).toBe("\"'=HYPERLINK(\"\"http://evil\"\")\"");
    expect(csvCell("+639171234567")).toBe("'+639171234567");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
  });

  it("writes a header, Manila dates and fixed 2-decimal amounts", () => {
    const csv = ledgerToCsv([row({ payment_date: "2026-10-31T17:00:00Z", amount: 1500 })]);
    const lines = csv.replace(/^﻿/, "").trim().split("\r\n");
    expect(lines[0]).toBe("Date (Manila),Booking,Tourist,Package,Method,Channel,Reference,Status,Amount (PHP),Notes");
    expect(lines[1]).toBe("2026-11-01,BK-1,Maya Santos,Bagasbas Surf,GCash,Manual,REF1,completed,1500.00,");
    expect(csv.startsWith("﻿")).toBe(true);
  });
});
