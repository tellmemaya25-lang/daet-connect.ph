/**
 * The tours_admin_audit_log `valid_action` constraint is a closed list that
 * each migration rewrites in full. Adding an admin action means extending it,
 * and a rewrite that forgets an older action breaks that action in production.
 * This test reads the migrations and app code to catch both.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..");
const MIGRATIONS = join(ROOT, "supabase", "migrations");

/** Undated scripts predate the dated migrations; dated ones apply in name order. */
function migrationFiles(): string[] {
  const all = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql"));
  const dated = all.filter((f) => /^\d{8}_/.test(f)).sort();
  return [...all.filter((f) => !dated.includes(f)).sort(), ...dated];
}

const stripComments = (sql: string) => sql.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
const literals = (s: string) => [...s.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);

/** Each valid_action list, in the order the migrations define it. */
function constraintLists(): { file: string; actions: string[] }[] {
  const lists: { file: string; actions: string[] }[] = [];
  for (const file of migrationFiles()) {
    const sql = stripComments(readFileSync(join(MIGRATIONS, file), "utf8"));
    const re = /CONSTRAINT\s+valid_action\s+CHECK\s*\(\s*action\s*(?:IN\s*\(([^)]*)\)|=\s*ANY\s*\(\s*ARRAY\s*\[([^\]]*)\])/gi;
    for (const m of sql.matchAll(re)) lists.push({ file, actions: literals(m[1] ?? m[2]) });
  }
  return lists;
}

/** The value given for `action` in each SQL insert into the audit log. */
function sqlInsertActions(): { file: string; action: string }[] {
  const found: { file: string; action: string }[] = [];
  for (const file of migrationFiles()) {
    const sql = stripComments(readFileSync(join(MIGRATIONS, file), "utf8"));
    const re = /INSERT\s+INTO\s+(?:public\.)?tours_admin_audit_log\s*\(([^)]*)\)\s*VALUES\s*\(([\s\S]*?)\)\s*;/gi;
    for (const m of sql.matchAll(re)) {
      const index = m[1].split(",").map((c) => c.trim()).indexOf("action");
      const value = m[2].split(",")[index]?.trim() ?? "";
      const literal = /^'([a-z_]+)'$/.exec(value);
      if (literal) found.push({ file, action: literal[1] });
    }
  }
  return found;
}

/** `action: '...'` in app code that writes to the audit log. */
function appInsertActions(): { file: string; action: string }[] {
  const found: { file: string; action: string }[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.tsx?$/.test(entry.name) && !entry.name.includes(".test.") && !entry.name.endsWith(".d.ts")) {
        const src = readFileSync(path, "utf8");
        for (const m of src.matchAll(/from\(\s*['"]tours_admin_audit_log['"]\s*\)\s*\.insert\(\s*\{([\s\S]*?)\}/g)) {
          const action = /action:\s*['"]([a-z_]+)['"]/.exec(m[1]);
          if (action) found.push({ file: path.slice(ROOT.length + 1), action: action[1] });
        }
      }
    }
  };
  walk(join(ROOT, "src"));
  return found;
}

describe("tours_admin_audit_log valid_action", () => {
  const lists = constraintLists();
  const latest = lists.at(-1)!;

  it("is defined in the migrations", () => {
    expect(lists.length).toBeGreaterThan(0);
    expect(latest.actions.length).toBeGreaterThan(0);
  });

  it("allows every action the migrations and app write", () => {
    const writes = [...sqlInsertActions(), ...appInsertActions()];
    expect(writes.length).toBeGreaterThan(0);
    const missing = writes.filter((w) => !latest.actions.includes(w.action));
    expect(missing).toEqual([]);
  });

  it("never drops an action an earlier migration allowed", () => {
    const dropped = lists.flatMap((l) =>
      l.actions.filter((a) => !latest.actions.includes(a)).map((action) => ({ action, allowedIn: l.file, droppedBy: latest.file })),
    );
    expect(dropped).toEqual([]);
  });
});
