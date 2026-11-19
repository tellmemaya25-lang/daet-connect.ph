import { backupFileStem, parseBackupFormat, parseBackupItems, tablesToJson, tableToCsv } from "./backup";

describe("parseBackupItems", () => {
  it("keeps known items in list order, once each, and accepts comma lists", () => {
    expect(parseBackupItems(["reviews", "bookings", "bookings"])).toEqual(["bookings", "reviews"]);
    expect(parseBackupItems(["payments,packages"])).toEqual(["payments", "packages"]);
  });
  it("drops anything unknown", () => {
    expect(parseBackupItems(["profiles", "../etc", ""])).toEqual([]);
  });
});

describe("parseBackupFormat", () => {
  it("defaults to zip", () => {
    expect(parseBackupFormat(null)).toBe("zip");
    expect(parseBackupFormat("xml")).toBe("zip");
    expect(parseBackupFormat("json")).toBe("json");
  });
});

describe("tableToCsv", () => {
  const table = {
    columns: [{ key: "ref", label: "Reference" }, { key: "name", label: "Name" }, { key: "paid", label: "Paid (PHP)" }],
    rows: [{ ref: "CD1", name: 'Santos, "Maya"', paid: 1200 }, { ref: "=SUM(A1)", name: null, paid: false }],
  };
  it("writes a header, quotes cells and neutralises formulas, after a BOM", () => {
    expect(tableToCsv(table)).toBe('﻿Reference,Name,Paid (PHP)\r\nCD1,"Santos, ""Maya""",1200\r\n\'=SUM(A1),,false\r\n');
  });
});

describe("tablesToJson", () => {
  it("nests each table's rows under data", () => {
    const json = JSON.parse(tablesToJson({ exportedAt: "2026-11-19T00:00:00Z", business: "Kalmado" }, { packages: { columns: [], rows: [{ title: "Surf" }] } }));
    expect(json).toEqual({ exported_at: "2026-11-19T00:00:00Z", business: "Kalmado", data: { packages: [{ title: "Surf" }] } });
  });
});

describe("backupFileStem", () => {
  it("uses the Manila date", () => {
    expect(backupFileStem(new Date("2026-11-18T17:00:00Z"))).toBe("connect-daet-backup-2026-11-19");
  });
});
