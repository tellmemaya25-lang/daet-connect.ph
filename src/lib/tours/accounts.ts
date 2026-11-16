/**
 * Admin account management (owner's list, item 7): who has which role, and
 * who is suspended. The list comes from tours_admin_list_accounts().
 */
export const ROLES = ["tourist", "operator", "guide", "admin"] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_LABEL: Record<Role, string> = { tourist: "Tourist", operator: "Operator", guide: "Guide", admin: "Admin" };

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export type Account = {
  id: string;
  name: string;
  email: string | null;
  role: Role;
  createdAt: string | null;
  lastSignInAt: string | null;
  suspended: boolean;
  suspendedReason: string | null;
  hasOperator: boolean;
  hasGuide: boolean;
};

export type AccountList = { total: number; counts: Record<string, number>; accounts: Account[] };

export const ACCOUNTS_PAGE_SIZE = 50;

/** ?q= (name or email), ?role= (a role or "suspended"), ?page= (1-based). */
export function parseAccountFilters(params: Record<string, string | string[] | undefined>): { q: string; role: Role | "suspended" | ""; page: number } {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const q = one(params.q).trim().slice(0, 80);
  const roleParam = one(params.role);
  const role = isRole(roleParam) || roleParam === "suspended" ? roleParam : "";
  const page = Math.max(1, Math.min(1000, Number.parseInt(one(params.page), 10) || 1));
  return { q, role, page };
}

export function parseAccounts(data: unknown): AccountList {
  const d = (data ?? {}) as Record<string, unknown>;
  const counts = (d.counts && typeof d.counts === "object" ? d.counts : {}) as Record<string, number>;
  const rows = Array.isArray(d.accounts) ? (d.accounts as Record<string, unknown>[]) : [];
  return {
    total: Number(d.total) || 0,
    counts,
    accounts: rows.map((r) => ({
      id: String(r.id),
      name: typeof r.full_name === "string" && r.full_name.trim() ? r.full_name : "No name",
      email: typeof r.email === "string" ? r.email : null,
      role: isRole(r.role) ? r.role : "tourist",
      createdAt: typeof r.created_at === "string" ? r.created_at : null,
      lastSignInAt: typeof r.last_sign_in_at === "string" ? r.last_sign_in_at : null,
      suspended: r.is_suspended === true,
      suspendedReason: typeof r.suspended_reason === "string" ? r.suspended_reason : null,
      hasOperator: r.has_operator === true,
      hasGuide: r.has_guide === true,
    })),
  };
}

/** Roles an admin may give this account: operator and guide need their application on file. */
export function allowedRoles(account: Pick<Account, "hasOperator" | "hasGuide">): Role[] {
  return ROLES.filter((r) => (r === "operator" ? account.hasOperator : r === "guide" ? account.hasGuide : true));
}
