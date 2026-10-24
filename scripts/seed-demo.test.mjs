import assert from "node:assert/strict";
import { test } from "node:test";
import { applyDemoPlan, buildDemoPlan, ROLES, weekendDates } from "./seed-demo.mjs";

test("weekend dates are Saturdays and Sundays after today", () => {
  const dates = weekendDates("2026-10-23", 10); // a Friday
  assert.deepEqual(dates, ["2026-10-24", "2026-10-25", "2026-10-31", "2026-11-01"]);
});

test("plan has one account per role per group, unique emails", () => {
  const plan = buildDemoPlan({ groups: 3, today: "2026-10-23" });
  assert.equal(plan.length, 3);
  const emails = plan.flatMap((g) => Object.values(g.users).map((u) => u.email));
  assert.equal(emails.length, 3 * ROLES.length);
  assert.equal(new Set(emails).size, emails.length);
  assert.ok(emails.every((e) => e.endsWith("@demo.connect-daet.test")));
  for (const g of plan) {
    assert.equal(g.pkg.status, "published");
    assert.equal(g.operator.accreditation_status, "approved");
    assert.ok(g.availability.length >= 8);
    assert.ok(g.stops.every((s) => Number.isFinite(s.latitude) && Number.isFinite(s.longitude)));
  }
});

test("plan rejects bad settings", () => {
  assert.throws(() => buildDemoPlan({ groups: 0, today: "2026-10-23" }));
  assert.throws(() => buildDemoPlan({ groups: 21, today: "2026-10-23" }));
  assert.throws(() => buildDemoPlan({ groups: 1, domain: "not a domain", today: "2026-10-23" }));
});

test("apply creates accounts, sets roles, and is idempotent", async () => {
  // Minimal in-memory stand-in for the Supabase admin client.
  const db = { profiles: [], tours_operators: [], tours_guides: [], tours_packages: [], tours_package_price_variants: [], tours_package_stops: [], tours_package_inclusions: [], tours_package_availability: [], tours_package_guides: [] };
  const users = [];
  let next = 1;
  const id = () => `id-${next++}`;
  const table = (name) => {
    const filters = [];
    const rows = () => db[name].filter((r) => filters.every(([k, v]) => r[k] === v));
    const api = {
      select: (_cols, opts) => {
        api._head = opts?.head;
        return api;
      },
      eq: (k, v) => {
        filters.push([k, v]);
        return api;
      },
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      then: (resolve) => resolve({ count: rows().length, data: rows(), error: null }),
      insert: (values) => {
        const list = (Array.isArray(values) ? values : [values]).map((v) => ({ id: id(), ...v }));
        db[name].push(...list);
        return { select: () => ({ single: async () => ({ data: list[0], error: null }) }), then: (r) => r({ error: null }) };
      },
      update: (values) => ({ eq: async (k, v) => (db[name].filter((r) => r[k] === v).forEach((r) => Object.assign(r, values)), { error: null }) }),
      upsert: async (values, opts) => {
        for (const v of Array.isArray(values) ? values : [values]) {
          const keys = opts?.onConflict ? opts.onConflict.split(",") : ["id"];
          const found = db[name].find((r) => keys.every((k) => r[k] === v[k]));
          if (found) {
            if (!opts?.ignoreDuplicates) Object.assign(found, v);
          } else db[name].push({ id: v.id ?? id(), ...v });
        }
        return { error: null };
      },
    };
    return api;
  };
  const admin = {
    from: table,
    auth: {
      admin: {
        listUsers: async () => ({ data: { users }, error: null }),
        createUser: async ({ email }) => {
          const user = { id: id(), email };
          users.push(user);
          return { data: { user }, error: null };
        },
        updateUserById: async (uid) => ({ data: { user: users.find((u) => u.id === uid) }, error: null }),
      },
    },
  };

  const plan = buildDemoPlan({ groups: 2, today: "2026-10-23" });
  await applyDemoPlan(admin, plan, "a-long-demo-password");
  await applyDemoPlan(admin, plan, "a-long-demo-password");

  assert.equal(users.length, 8);
  assert.deepEqual(db.profiles.map((p) => p.role).sort(), ["admin", "admin", "guide", "guide", "operator", "operator", "tourist", "tourist"]);
  assert.equal(db.tours_operators.length, 2);
  assert.equal(db.tours_packages.length, 2);
  assert.equal(db.tours_package_price_variants.length, 2);
  assert.equal(db.tours_package_stops.length, 6);
  assert.equal(db.tours_package_availability.length, plan[0].availability.length * 2);
  assert.equal(db.tours_package_guides.length, 2);
});
