import Link from "next/link";
import { Notice } from "@/components/ui/notice";
import { PageFrame } from "@/components/ui/page-frame";
import { Input, Select } from "@/components/ui/field";
import { AdminPageHeading, PromoAdminDenied } from "@/components/tours/promo-admin-denied";
import { ACCOUNTS_PAGE_SIZE, parseAccountFilters, parseAccounts, ROLE_LABEL, ROLES } from "@/lib/tours/accounts";
import { requirePromoAdmin } from "@/lib/tours/promo-admin";
import { AccountRow } from "./account-row";

export const metadata = { title: "Accounts and roles" };

export default async function AdminAccountsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const admin = await requirePromoAdmin();
  if (!admin.ok) return <PromoAdminDenied message={admin.error} next="/tours/admin/accounts" />;

  const filters = parseAccountFilters(await searchParams);
  const { data, error } = await admin.supabase.rpc("tours_admin_list_accounts", {
    p_query: filters.q || null,
    p_role: filters.role || null,
    p_limit: ACCOUNTS_PAGE_SIZE,
    p_offset: (filters.page - 1) * ACCOUNTS_PAGE_SIZE,
  });
  const list = parseAccounts(data);
  const pages = Math.max(1, Math.ceil(list.total / ACCOUNTS_PAGE_SIZE));
  const pageHref = (page: number) => `/tours/admin/accounts?${new URLSearchParams({ ...(filters.q ? { q: filters.q } : {}), ...(filters.role ? { role: filters.role } : {}), page: String(page) })}`;

  return (
    <PageFrame adminNav>
      <AdminPageHeading title="Accounts and roles" backHref="/tours/admin" backLabel="Admin dashboard" />
      <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
        {ROLES.map((r) => `${list.counts[r] ?? 0} ${ROLE_LABEL[r].toLowerCase()}${(list.counts[r] ?? 0) === 1 ? "" : "s"}`).join(" · ")}
      </p>

      <form action="/tours/admin/accounts" className="mb-6 flex flex-wrap items-end gap-2">
        <label className="min-w-0 flex-1 text-sm font-bold text-daet-ink">
          Name or email
          <Input name="q" defaultValue={filters.q} placeholder="Search accounts" />
        </label>
        <label className="text-sm font-bold text-daet-ink">
          Show
          <Select name="role" defaultValue={filters.role} className="w-44">
            <option value="">Everyone</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}s
              </option>
            ))}
            <option value="suspended">Suspended</option>
          </Select>
        </label>
        <button type="submit" className="min-h-12 rounded-full bg-blue-600 px-6 text-sm font-bold text-white hover:bg-blue-700">
          Search
        </button>
      </form>

      {error ? (
        <Notice variant="error" title="Accounts could not be loaded">
          {error.code === "PGRST202" ? "The database update for account management has not been applied yet." : "Please try again in a moment."}
        </Notice>
      ) : list.accounts.length === 0 ? (
        <p className="rounded-2xl bg-surface p-4 text-slate-600 dark:text-slate-400">No accounts match.</p>
      ) : (
        <ul className="space-y-3">
          {list.accounts.map((account) => (
            <AccountRow key={account.id} account={account} isSelf={account.id === admin.userId} />
          ))}
        </ul>
      )}

      {pages > 1 ? (
        <nav aria-label="Pages" className="mt-6 flex items-center justify-between gap-2 text-sm">
          {filters.page > 1 ? <Link className="font-bold text-blue-700 hover:underline dark:text-blue-300" href={pageHref(filters.page - 1)}>← Previous</Link> : <span />}
          <span>
            Page {filters.page} of {pages}
          </span>
          {filters.page < pages ? <Link className="font-bold text-blue-700 hover:underline dark:text-blue-300" href={pageHref(filters.page + 1)}>Next →</Link> : <span />}
        </nav>
      ) : null}
    </PageFrame>
  );
}
