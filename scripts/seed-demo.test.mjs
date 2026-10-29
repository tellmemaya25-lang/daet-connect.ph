import assert from "node:assert/strict";
import { test } from "node:test";
import { applyDemoPlan, buildDemoPlan, buildRealisticPlan, guideSchedule, ROLES, weekendDates } from "./seed-demo.mjs";

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

test("realistic plan (R4): 5 operators, 8 guides, 10 tourists, 1 admin, unique emails", () => {
  const plan = buildRealisticPlan({ today: "2026-10-29" });
  assert.equal(plan.operators.length, 5);
  assert.equal(plan.guides.length, 8);
  assert.equal(plan.tourists.length, 10);
  const emails = [plan.admin, ...plan.operators.map((o) => o.user), ...plan.guides.map((g) => g.user), ...plan.tourists].map((u) => u.email);
  assert.equal(emails.length, 24);
  assert.equal(new Set(emails).size, 24);
  assert.ok(emails.every((e) => e.endsWith("@demo.connect-daet.test")));
  for (const op of plan.operators) {
    assert.equal(op.operator.accreditation_status, "approved");
    for (const p of op.packages) {
      assert.equal(p.pkg.status, "published");
      assert.ok(p.availability.length >= 8);
      assert.ok(p.stops.every((st) => Number.isFinite(st.latitude) && Number.isFinite(st.longitude)));
    }
  }
});

test("realistic bookings follow the real rules: future dates, open dates, free available guides", () => {
  const today = "2026-10-29";
  const plan = buildRealisticPlan({ today });
  assert.ok(plan.bookings.length >= 12);
  assert.equal(new Set(plan.bookings.map((b) => b.reference)).size, plan.bookings.length);
  const seen = new Set();
  for (const b of plan.bookings) {
    assert.ok(b.tour_date > today);
    const pkg = plan.operators[b.operator].packages[b.package];
    assert.ok(pkg.availability.some((a) => a.available_date === b.tour_date), `${b.reference} on a closed date`);
    assert.ok(b.number_of_pax >= pkg.variant.min_pax && b.number_of_pax <= pkg.variant.max_pax);
    if (b.status === "confirmed") {
      assert.notEqual(b.guide, null, `${b.reference} has no guide`);
      const guide = plan.guides[b.guide];
      assert.ok(guide.operators.includes(b.operator));
      assert.ok(guide.schedule.some((s) => s.available_date === b.tour_date && s.is_available), `${b.reference}: guide not available`);
      const key = `${b.guide}|${b.tour_date}`;
      assert.ok(!seen.has(key), `${b.reference}: guide double-booked`);
      seen.add(key);
      assert.ok(b.paid >= 0 && b.paid <= b.total);
    } else {
      assert.equal(b.paid, 0);
    }
  }
  const statuses = new Set(plan.bookings.map((b) => b.status));
  for (const s of ["pending", "confirmed", "cancelled"]) assert.ok(statuses.has(s), `no ${s} booking`);
  assert.ok(plan.bookings.some((b) => b.paid === b.total && b.paid > 0));
  assert.ok(plan.bookings.some((b) => b.paid > 0 && b.paid < b.total));
});

test("guide schedules leave some days unavailable or not set on purpose", () => {
  const all = guideSchedule(0, "2026-10-29");
  assert.ok(all.some((d) => d.is_available) && all.some((d) => !d.is_available));
  assert.ok(guideSchedule(7, "2026-10-29").length < all.length, "guide 8 leaves weekdays not set");
});
