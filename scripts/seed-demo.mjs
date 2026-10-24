#!/usr/bin/env node
/**
 * Demo / evaluation seed (F12). Creates, per evaluator group, one account for
 * each role (tourist, operator, guide, admin) plus a published demo package
 * with weekend availability, so an SOP 4 session can run end to end.
 *
 * Use on a local or staging project, not on the production project the town
 * uses. Passwords are never stored in the repo: you pass one in DEMO_PASSWORD.
 *
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   DEMO_PASSWORD='choose-a-long-one' DEMO_GROUPS=3 node scripts/seed-demo.mjs
 *
 *   node scripts/seed-demo.mjs --dry-run   # print the plan, touch nothing
 *
 * Safe to re-run: existing accounts get the new password and existing rows
 * are updated in place. Attractions and the 2026 events come from the
 * migrations / supabase/seed/attractions.sql.
 */
import { createClient } from "@supabase/supabase-js";
import { pathToFileURL } from "node:url";

export const DEFAULT_DOMAIN = "demo.connect-daet.test";
export const ROLES = ["tourist", "operator", "guide", "admin"];

const STOPS = [
  { location_name: "First José Rizal Monument", description: "Meet at Rizal Park.", latitude: 14.1131, longitude: 122.9545 },
  { location_name: "Daet Heritage Center", description: "Guided museum visit.", latitude: 14.113187, longitude: 122.954828 },
  { location_name: "Bagasbas Beach", description: "Beginner surf lesson.", latitude: 14.131583, longitude: 122.985083 },
];

/** Weekend dates (Manila) in the next `days` days, starting tomorrow. */
export function weekendDates(today, days = 30) {
  const out = [];
  const start = new Date(`${today}T00:00:00Z`);
  for (let i = 1; i <= days; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6) out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** Everything the seed will create, without touching the network. */
export function buildDemoPlan({ groups = 1, domain = DEFAULT_DOMAIN, today }) {
  if (!Number.isInteger(groups) || groups < 1 || groups > 20) throw new Error("DEMO_GROUPS must be a whole number from 1 to 20.");
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) throw new Error("DEMO_EMAIL_DOMAIN must look like a domain, e.g. demo.connect-daet.test.");
  const dates = weekendDates(today);
  return Array.from({ length: groups }, (_, index) => {
    const g = index + 1;
    const users = Object.fromEntries(
      ROLES.map((role) => [role, { role, email: `${role}${g}@${domain}`, full_name: `Demo ${role[0].toUpperCase()}${role.slice(1)} ${g}` }]),
    );
    return {
      group: g,
      users,
      operator: {
        business_name: `Demo Tours Daet (Group ${g})`,
        business_description: "Demo operator for evaluation sessions. Not a real business.",
        business_address: "Daet, Camarines Norte",
        contact_person: users.operator.full_name,
        contact_phone: `0917 000 00${String(g).padStart(2, "0")}`,
        contact_email: users.operator.email,
        gcash_number: "0917 000 0000",
        gcash_name: "DEMO ONLY",
        payment_instructions: "Demo only: use the PayMongo sandbox or upload any image as a receipt. No real money.",
        accreditation_status: "approved",
      },
      guide: {
        bio: "Demo guide for evaluation sessions.",
        years_experience: 3,
        specialties: ["surfing", "heritage"],
        contact_phone: `0918 000 00${String(g).padStart(2, "0")}`,
        accreditation_status: "approved",
        consent_full_id_display: false,
      },
      pkg: {
        title: `Demo: Surf & Heritage Morning (Group ${g})`,
        description: "A half-day sample tour for testers: Rizal Monument, the Heritage Center and a beginner surf lesson at Bagasbas.",
        location_name: "Daet, Camarines Norte",
        duration_value: 4,
        duration_type: "hours",
        status: "published",
      },
      variant: { variant_name: "Standard", price_per_pax: 500, flat_price: null, min_pax: 1, max_pax: 10, is_default: true },
      stops: STOPS.map((stop, i) => ({ ...stop, stop_order: i })),
      inclusions: [
        { item_text: "Surfboard and rash guard", is_included: true },
        { item_text: "Hotel pickup in Daet", is_included: true },
        { item_text: "Lunch", is_included: false },
      ],
      availability: dates.map((available_date) => ({ available_date, capacity_total: 10 })),
    };
  });
}

function fail(message) {
  console.error(`✖ ${message}`);
  process.exit(1);
}

async function findUsersByEmail(admin) {
  const byEmail = new Map();
  for (let page = 1; page < 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const user of data.users) if (user.email) byEmail.set(user.email.toLowerCase(), user);
    if (data.users.length < 1000) break;
  }
  return byEmail;
}

async function upsertBy(admin, table, match, values) {
  let query = admin.from(table).select("id");
  for (const [k, v] of Object.entries(match)) query = query.eq(k, v);
  const { data: existing, error } = await query.maybeSingle();
  if (error) throw new Error(`${table}: ${error.message}`);
  if (existing) {
    const { error: updateError } = await admin.from(table).update(values).eq("id", existing.id);
    if (updateError) throw new Error(`${table}: ${updateError.message}`);
    return existing.id;
  }
  const { data, error: insertError } = await admin.from(table).insert({ ...match, ...values }).select("id").single();
  if (insertError) throw new Error(`${table}: ${insertError.message}`);
  return data.id;
}

export async function applyDemoPlan(admin, plan, password) {
  const existing = await findUsersByEmail(admin);
  for (const group of plan) {
    const ids = {};
    for (const user of Object.values(group.users)) {
      const found = existing.get(user.email);
      const { data, error } = found
        ? await admin.auth.admin.updateUserById(found.id, { password, email_confirm: true, user_metadata: { full_name: user.full_name } })
        : await admin.auth.admin.createUser({ email: user.email, password, email_confirm: true, user_metadata: { full_name: user.full_name } });
      if (error) throw new Error(`${user.email}: ${error.message}`);
      ids[user.role] = data.user.id;
      const { error: profileError } = await admin.from("profiles").upsert({ id: data.user.id, role: user.role, full_name: user.full_name });
      if (profileError) throw new Error(`profile ${user.email}: ${profileError.message}`);
    }

    const operatorId = await upsertBy(admin, "tours_operators", { profile_id: ids.operator }, { ...group.operator, reviewed_by: ids.admin, reviewed_at: new Date().toISOString() });
    const guideId = await upsertBy(admin, "tours_guides", { profile_id: ids.guide }, { ...group.guide, reviewed_by: ids.admin, reviewed_at: new Date().toISOString() });
    const packageId = await upsertBy(admin, "tours_packages", { operator_id: operatorId, title: group.pkg.title }, group.pkg);

    // Children are replaced wholesale so re-runs stay in sync with the plan.
    for (const [table, rows] of [
      ["tours_package_price_variants", [group.variant]],
      ["tours_package_stops", group.stops],
      ["tours_package_inclusions", group.inclusions],
    ]) {
      const { count } = await admin.from(table).select("id", { count: "exact", head: true }).eq("package_id", packageId);
      if (!count) {
        const { error } = await admin.from(table).insert(rows.map((row) => ({ ...row, package_id: packageId })));
        if (error) throw new Error(`${table}: ${error.message}`);
      }
    }
    const { error: availabilityError } = await admin
      .from("tours_package_availability")
      .upsert(group.availability.map((row) => ({ ...row, package_id: packageId })), { onConflict: "package_id,available_date", ignoreDuplicates: true });
    if (availabilityError) throw new Error(`availability: ${availabilityError.message}`);
    await upsertBy(admin, "tours_package_guides", { package_id: packageId, guide_id: guideId }, { is_active: true });
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const groups = Number(process.env.DEMO_GROUPS ?? 1);
  const domain = (process.env.DEMO_EMAIL_DOMAIN ?? DEFAULT_DOMAIN).toLowerCase();
  const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  let plan;
  try {
    plan = buildDemoPlan({ groups, domain, today });
  } catch (error) {
    fail(error.message);
  }

  console.log(`Demo seed: ${plan.length} group(s), ${plan.length * ROLES.length} accounts, ${plan[0].availability.length} open weekend dates per package.`);
  if (dryRun) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const password = process.env.DEMO_PASSWORD ?? "";
  if (!url || !key) fail("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (server key; never commit it).");
  if (password.length < 10) fail("Set DEMO_PASSWORD to at least 10 characters. It is not stored anywhere by this script.");

  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  await applyDemoPlan(admin, plan, password);

  console.log("\nCredentials sheet (print it; do not commit it). Password for every account: the DEMO_PASSWORD you set.\n");
  console.log("Group | Role     | Email");
  console.log("------|----------|------------------------------");
  for (const group of plan) for (const user of Object.values(group.users)) console.log(`${String(group.group).padEnd(5)} | ${user.role.padEnd(8)} | ${user.email}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => fail(error.message ?? String(error)));
}
