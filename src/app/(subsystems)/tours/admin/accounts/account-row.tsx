"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { allowedRoles, ROLE_LABEL, type Account } from "@/lib/tours/accounts";
import { setAccountRole, setAccountSuspended, type AccountActionResult } from "./actions";

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" }) : "Never");

/** One account: its role (changeable) and whether it can sign in. */
export function AccountRow({ account, isSelf }: { account: Account; isSelf: boolean }) {
  const router = useRouter();
  const [role, setRole] = useState(account.role);
  const [reason, setReason] = useState("");
  const [askReason, setAskReason] = useState(false);
  const [result, setResult] = useState<AccountActionResult | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<AccountActionResult>) =>
    start(async () => {
      const r = await fn();
      setResult(r);
      if (r.ok) {
        setAskReason(false);
        setReason("");
        router.refresh();
      }
    });

  return (
    <li className="rounded-2xl card-edge bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold text-daet-ink">
            {account.name} {isSelf ? <span className="text-sm font-normal text-slate-600 dark:text-slate-400">(you)</span> : null}
          </p>
          <p className="break-all text-sm text-slate-600 dark:text-slate-400">{account.email ?? "No email"}</p>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Joined {when(account.createdAt)} · Last sign-in {when(account.lastSignInAt)}
          </p>
          {account.suspended ? (
            <p className="mt-1 text-sm font-bold text-red-700 dark:text-red-300">Suspended{account.suspendedReason ? `: ${account.suspendedReason}` : ""}</p>
          ) : null}
        </div>
        {isSelf ? (
          <p className="text-sm font-bold text-daet-ink">{ROLE_LABEL[account.role]}</p>
        ) : (
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-sm font-bold text-daet-ink">
              Role
              <Select value={role} onChange={(e) => setRole(e.target.value as Account["role"])} className="w-40">
                {allowedRoles(account).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </Select>
            </label>
            <Button variant="secondary" disabled={pending || role === account.role} onClick={() => run(() => setAccountRole(account.id, role))}>
              Save role
            </Button>
            {account.suspended ? (
              <Button variant="ghost" disabled={pending} onClick={() => run(() => setAccountSuspended(account.id, false, ""))}>
                Restore
              </Button>
            ) : (
              <Button variant="danger" disabled={pending} onClick={() => setAskReason((v) => !v)} aria-expanded={askReason}>
                Suspend
              </Button>
            )}
          </div>
        )}
      </div>
      {askReason && !account.suspended ? (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="min-w-0 flex-1 text-sm font-bold text-daet-ink">
            Reason (shown to admins)
            <Input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Fake bookings" />
          </label>
          <Button variant="danger" disabled={pending} onClick={() => run(() => setAccountSuspended(account.id, true, reason))}>
            Confirm suspension
          </Button>
        </div>
      ) : null}
      {result ? (
        <p role="status" className={`mt-2 text-sm font-semibold ${result.ok ? "text-green-800 dark:text-green-300" : "text-red-700 dark:text-red-300"}`}>
          {result.message}
        </p>
      ) : null}
    </li>
  );
}
