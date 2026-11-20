#!/usr/bin/env node
// PreToolUse hook for mcp__Supabase__execute_sql: approves a query without a prompt only when it is
// read-only SQL it fully recognises. Anything else prints nothing, so the normal permission prompt
// asks. It never denies.

const FORBIDDEN =
  /\b(insert|update|delete|merge|into|truncate|drop|alter|create|grant|revoke|copy|vacuum|reindex|cluster|refresh|call|execute|prepare|lock|listen|notify|unlisten|discard|reset|set|begin|commit|rollback|savepoint|attach|import|load)\b|\bfor\s+(no\s+key\s+)?(update|share)\b/;

// Schemas and catalogs that hold credentials or secrets: ask a person even for a SELECT.
const SENSITIVE = /\b(auth|vault|storage|pgsodium|extensions|cron|net|supabase_[a-z_]+)\s*\.|\bpg_(authid|shadow|user_mapping)\b/;

// Functions with no side effects. A call to any other function, including the project's own RPCs, asks.
const SAFE_FUNCTIONS = new Set(
  `count sum avg min max coalesce nullif greatest least lower upper length char_length left right substr substring position strpos
   replace trim btrim ltrim rtrim concat concat_ws format to_char to_date to_timestamp date_trunc date_part extract now age
   generate_series unnest array_agg string_agg json_agg jsonb_agg jsonb_build_object json_build_object jsonb_object_agg
   row_to_json to_json to_jsonb jsonb_array_elements jsonb_array_length jsonb_typeof jsonb_pretty jsonb_object_keys
   to_regclass to_regproc to_regtype pg_get_functiondef pg_get_indexdef pg_get_viewdef pg_get_constraintdef pg_get_expr
   pg_table_size pg_total_relation_size pg_relation_size pg_size_pretty obj_description col_description
   round ceil floor abs regexp_replace regexp_match regexp_matches split_part initcap bool_or bool_and
   row_number rank dense_rank lag lead first_value last_value array_length cardinality array_to_string string_to_array
   current_setting cast`.split(/\s+/),
);

// Words that sit before "(" without being function calls.
const KEYWORDS_BEFORE_PAREN = new Set(
  `in exists any all some values row over filter as on using and or not between case when then else end select from where group
   order by having limit offset union intersect except join left right inner outer cross full with distinct lateral interval
   array within partition rows range unbounded preceding following current`.split(/\s+/),
);

/** Lower-cases the SQL, drops comments and masks string literals. Returns null if it cannot be read safely. */
export function sanitize(sql) {
  let out = "";
  for (let i = 0; i < sql.length; ) {
    const c = sql[i];
    const next = sql[i + 1];
    if (c === "-" && next === "-") {
      while (i < sql.length && sql[i] !== "\n") i++;
    } else if (c === "/" && next === "*") {
      const end = sql.indexOf("*/", i + 2);
      if (end === -1) return null;
      i = end + 2;
      out += " ";
    } else if (c === "'") {
      // E'..' strings use backslash escapes that this reader does not model.
      if (/[eE]$/.test(out) && !/\w[eE]$/.test(out)) return null;
      i++;
      for (;;) {
        if (i >= sql.length) return null;
        if (sql[i] === "'" && sql[i + 1] === "'") i += 2;
        else if (sql[i] === "'") {
          i++;
          break;
        } else i++;
      }
      out += "''";
    } else if (c === '"') {
      const end = sql.indexOf('"', i + 1);
      if (end === -1) return null;
      out += "q";
      i = end + 1;
    } else if (c === "$") {
      const tag = /^\$[A-Za-z_]*\$/.exec(sql.slice(i));
      if (!tag) {
        out += c;
        i++;
        continue;
      }
      const end = sql.indexOf(tag[0], i + tag[0].length);
      if (end === -1) return null;
      out += "''";
      i = end + tag[0].length;
    } else {
      out += c.toLowerCase();
      i++;
    }
  }
  return out;
}

export function isReadOnly(sql) {
  if (typeof sql !== "string" || !sql.trim()) return false;
  const clean = sanitize(sql);
  if (clean === null) return false;
  const statements = clean.split(";").map((s) => s.trim()).filter(Boolean);
  if (statements.length === 0) return false;
  if (!statements.every((s) => /^(select|with|show|values)\b/.test(s) || s.startsWith("("))) return false;
  if (FORBIDDEN.test(clean) || SENSITIVE.test(clean)) return false;
  for (const m of clean.matchAll(/\b([a-z_][a-z0-9_]*(?:\.[a-z_][a-z0-9_]*)?)\s*\(/g)) {
    const name = m[1];
    if (KEYWORDS_BEFORE_PAREN.has(name) || SAFE_FUNCTIONS.has(name.replace(/^pg_catalog\./, ""))) continue;
    return false;
  }
  return true;
}

async function main() {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  let query;
  try {
    query = JSON.parse(input)?.tool_input?.query;
  } catch {
    return;
  }
  if (!isReadOnly(query)) return;
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
        permissionDecisionReason: "Read-only SQL (.claude/hooks/readonly-sql.mjs)",
      },
    }),
  );
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
