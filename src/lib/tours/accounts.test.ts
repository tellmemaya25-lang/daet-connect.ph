import { allowedRoles, parseAccountFilters, parseAccounts } from "./accounts";

describe("parseAccountFilters", () => {
  it("reads search, role and page", () => {
    expect(parseAccountFilters({ q: " ana ", role: "guide", page: "2" })).toEqual({ q: "ana", role: "guide", page: 2 });
  });
  it("ignores unknown roles and bad pages", () => {
    expect(parseAccountFilters({ role: "superuser", page: "-3" })).toEqual({ q: "", role: "", page: 1 });
    expect(parseAccountFilters({ role: "suspended" }).role).toBe("suspended");
  });
});

describe("parseAccounts", () => {
  it("maps rows and defaults odd values", () => {
    const list = parseAccounts({
      total: 2,
      counts: { tourist: 1, admin: 1 },
      accounts: [
        { id: "u1", full_name: "Ana", email: "ana@example.com", role: "guide", is_suspended: true, suspended_reason: "Spam", has_guide: true },
        { id: "u2", full_name: " ", role: "wizard" },
      ],
    });
    expect(list.accounts[0]).toMatchObject({ name: "Ana", role: "guide", suspended: true, hasGuide: true });
    expect(list.accounts[1]).toMatchObject({ name: "No name", role: "tourist", suspended: false, email: null });
  });
});

describe("allowedRoles", () => {
  it("offers operator and guide only with an application on file", () => {
    expect(allowedRoles({ hasOperator: false, hasGuide: false })).toEqual(["tourist", "admin"]);
    expect(allowedRoles({ hasOperator: true, hasGuide: true })).toEqual(["tourist", "operator", "guide", "admin"]);
  });
});
