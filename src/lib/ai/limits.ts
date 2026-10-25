/**
 * In-memory limits on AI calls, per person (user id) or connection (IP) and
 * per feature. Per server instance only: enough to stop one person running
 * up the bill, not a global quota. Past the limit, features answer with
 * their rule-based mode instead.
 */

export const AI_BUDGETS = {
  planner: { calls: 20, windowMs: 10 * 60 * 1000 },
  assistant: { calls: 30, windowMs: 10 * 60 * 1000 },
} as const;
export type AiBudget = keyof typeof AI_BUDGETS;

const calls = new Map<string, number[]>();
const MAX_KEYS = 5000;

/** Records a call and says whether it is within the budget. */
export function allowAiCall(budget: AiBudget, callerKey: string, now: number = Date.now()): boolean {
  const { calls: limit, windowMs } = AI_BUDGETS[budget];
  const key = `${budget}:${callerKey || "anonymous"}`;
  const recent = (calls.get(key) ?? []).filter((at) => now - at < windowMs);
  if (recent.length >= limit) {
    calls.set(key, recent);
    return false;
  }
  calls.set(key, [...recent, now]);
  if (calls.size > MAX_KEYS) calls.delete(calls.keys().next().value!);
  return true;
}

/** Test helper. */
export function resetAiLimits(): void {
  calls.clear();
}

/** The caller's key: their user id, else the first forwarded IP. */
export function aiCallerKey(userId: string | null | undefined, forwardedFor: string | null | undefined): string {
  return userId ?? forwardedFor?.split(",")[0]?.trim() ?? "anonymous";
}
