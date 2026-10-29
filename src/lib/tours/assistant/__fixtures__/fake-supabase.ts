import type { SupabaseClient } from "@supabase/supabase-js";

/** Minimal chainable stand-in for the Supabase query builder; filters are recorded and applied to plain rows. */
export type Filter = [op: string, column: string, value: unknown];
export type Tables = Record<string, Array<Record<string, unknown>>>;

export function fakeSupabase(tables: Tables, calls: Array<{ table: string; filters: Filter[] }> = []): SupabaseClient {
  const from = (table: string) => {
    const filters: Filter[] = [];
    let single = false;
    let limit = Infinity;
    const apply = () => {
      let rows = [...(tables[table] ?? [])];
      for (const [op, column, value] of filters) {
        if (op === "eq") rows = rows.filter((r) => r[column] === value);
        if (op === "gte") rows = rows.filter((r) => String(r[column]) >= String(value));
        if (op === "lte") rows = rows.filter((r) => String(r[column]) <= String(value));
        if (op === "in") rows = rows.filter((r) => (value as unknown[]).includes(r[column]));
        if (op === "ilike") rows = rows.filter((r) => String(r[column] ?? "").toLowerCase().includes(String(value).replace(/%/g, "").toLowerCase()));
        if (op === "or") {
          const term = /ilike\.%([^%]*)%/.exec(String(value))?.[1]?.toLowerCase() ?? "";
          rows = rows.filter((r) => ["title", "location_name", "description"].some((c) => String(r[c] ?? "").toLowerCase().includes(term)));
        }
      }
      rows = rows.slice(0, limit);
      return single ? { data: rows[0] ?? null, error: null } : { data: rows, error: null };
    };
    const builder: Record<string, unknown> = {};
    const chain = (op: string) => (column: string, value?: unknown) => {
      filters.push([op, column, value]);
      return builder;
    };
    Object.assign(builder, {
      select: () => builder,
      eq: chain("eq"),
      gte: chain("gte"),
      lte: chain("lte"),
      in: chain("in"),
      ilike: chain("ilike"),
      or: (expr: string) => {
        filters.push(["or", "", expr]);
        return builder;
      },
      order: () => builder,
      limit: (n: number) => {
        limit = n;
        return builder;
      },
      maybeSingle: () => {
        single = true;
        calls.push({ table, filters });
        return Promise.resolve(apply());
      },
      then: (resolve: (value: unknown) => unknown) => {
        calls.push({ table, filters });
        return Promise.resolve(apply()).then(resolve);
      },
    });
    return builder;
  };
  return { from } as unknown as SupabaseClient;
}
