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
 *   DEMO_PROFILE=realistic ... node scripts/seed-demo.mjs   # R4: 5 operators,
 *   8 guides with schedules, 10 tourists with upcoming bookings, 1 admin
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

// ---------------------------------------------------------------- realistic profile (R4)
// DEMO_PROFILE=realistic: 5 operators, 8 guides with schedules, 10 tourists
// with upcoming bookings, 1 admin. Bookings go through the real triggers
// (capacity, lifecycle, guide schedule), so only today-or-later dates are used.

const pin = (lat, lng) => ({ latitude: lat, longitude: lng });

export const REALISTIC_OPERATORS = [
  {
    name: "Calaguas Island Escapes",
    packages: [
      { title: "Calaguas Island Day Trip", price: 2500, location: "Calaguas, Vinzons", days: [5, 6, 0], capacity: 16, hours: 10, stops: [["Vinzons port", 14.1736, 122.9083], ["Mahabang Buhangin, Calaguas", 14.4489, 122.9306]], inclusions: ["Boat transfer", "Environmental fee", "Lunch"] },
      { title: "Calaguas Overnight Camping", price: 3800, location: "Calaguas, Vinzons", days: [6], capacity: 12, hours: 30, stops: [["Paracale port", 14.2797, 122.7867], ["Mahabang Buhangin, Calaguas", 14.4489, 122.9306]], inclusions: ["Boat transfer", "Tent", "Dinner and breakfast"] },
    ],
  },
  { name: "Mercedes Island Hoppers", packages: [{ title: "Mercedes Island Hopping: Apuao & Canimog", price: 1200, location: "Mercedes", days: [4, 5, 6, 0], capacity: 14, hours: 7, stops: [["Mercedes port", 14.1094, 123.0108], ["Apuao Grande sandbar", 14.0966, 123.1036], ["Canimog Island lighthouse", 14.1344, 123.0617]], inclusions: ["Boat transfer", "Snorkel set"] }] },
  { name: "Bagasbas Surf Co.", packages: [{ title: "Bagasbas Beginner Surf Lesson", price: 800, location: "Bagasbas Beach, Daet", days: [0, 1, 2, 3, 4, 5, 6], capacity: 10, hours: 2, stops: [["Bagasbas Beach", 14.131583, 122.985083]], inclusions: ["Surfboard and rash guard", "Instructor"] }] },
  { name: "Daet Heritage Walks", packages: [{ title: "Daet Heritage Walk", price: 450, location: "Daet Poblacion", days: [2, 3, 4, 5, 6, 0], capacity: 20, hours: 3, stops: [["First José Rizal Monument", 14.1131, 122.9545], ["Daet Heritage Center", 14.113187, 122.954828], ["St. John the Baptist Church", 14.1125, 122.955]], inclusions: ["Local guide", "Museum entrance"] }] },
  { name: "Vinzons River & Heritage Tours", packages: [{ title: "Vinzons Heritage & River Tour", price: 950, location: "Vinzons", days: [5, 6, 0], capacity: 12, hours: 5, stops: [["Vinzons town plaza", 14.1736, 122.9083], ["Wenceslao Vinzons shrine", 14.1745, 122.9078]], inclusions: ["Van transfer from Daet", "Snacks"] }] },
];

export const REALISTIC_GUIDES = [
  { name: "Ramon Dela Paz", specialties: ["island hopping", "snorkeling"], years: 9, operators: [0, 1] },
  { name: "Liza Bautista", specialties: ["camping", "island hopping"], years: 6, operators: [0] },
  { name: "Paolo Reyes", specialties: ["surfing"], years: 7, operators: [2] },
  { name: "Ana Villanueva", specialties: ["heritage", "food"], years: 4, operators: [3, 4] },
  { name: "Mark Enriquez", specialties: ["surfing", "beach safety"], years: 3, operators: [2] },
  { name: "Joy Santiago", specialties: ["heritage", "storytelling"], years: 10, operators: [3] },
  { name: "Carlo Mendoza", specialties: ["island hopping", "boat safety"], years: 5, operators: [1, 0] },
  { name: "Grace Ocampo", specialties: ["river tours", "heritage"], years: 2, operators: [4] },
];

const TOURIST_NAMES = ["Juan Dela Cruz", "Maria Santos", "Jose Ramos", "Kristine Lim", "Miguel Torres", "Patricia Cruz", "Daniel Aquino", "Sofia Navarro", "Rafael Garcia", "Bea Castillo"];

const addDays = (date, n) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const weekday = (date) => new Date(`${date}T00:00:00Z`).getUTCDay();

/** Guide schedule: weekends available for everyone; weekdays vary; guide 8 leaves most days "not set" and guide 5 is away one weekend. */
export function guideSchedule(guideIndex, today, days = 60) {
  const out = [];
  for (let i = 1; i <= days; i++) {
    const date = addDays(today, i);
    const dow = weekday(date);
    const weekend = dow === 0 || dow === 5 || dow === 6;
    if (guideIndex === 7 && !weekend) continue; // not set
    if (guideIndex === 4 && i >= 15 && i <= 17) out.push({ available_date: date, is_available: false });
    else if (weekend || (i + guideIndex) % 3 !== 0) out.push({ available_date: date, is_available: true });
    else out.push({ available_date: date, is_available: false });
  }
  return out;
}

export function buildRealisticPlan({ domain = DEFAULT_DOMAIN, today }) {
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) throw new Error("DEMO_EMAIL_DOMAIN must look like a domain, e.g. demo.connect-daet.test.");
  const user = (role, n, full_name) => ({ role, email: `${role}${n}@${domain}`, full_name });
  const admin = user("admin", 1, "Daet Tourism Office (demo)");
  const operators = REALISTIC_OPERATORS.map((op, i) => ({
    user: user("operator", i + 1, `${op.name} (demo)`),
    operator: {
      business_name: op.name,
      business_description: "Demo operator for evaluation sessions. Not a real business.",
      business_address: "Daet, Camarines Norte",
      contact_person: `${op.name} desk`,
      contact_phone: `0917 100 00${String(i + 1).padStart(2, "0")}`,
      contact_email: `operator${i + 1}@${domain}`,
      gcash_number: "0917 000 0000",
      gcash_name: "DEMO ONLY",
      payment_instructions: "Demo only: use the PayMongo sandbox or upload any image as a receipt. No real money.",
      accreditation_status: "approved",
    },
    packages: op.packages.map((p) => {
      const dates = [];
      for (let d = 1; d <= 60; d++) if (p.days.includes(weekday(addDays(today, d)))) dates.push(addDays(today, d));
      return {
        pkg: { title: p.title, description: `Demo tour: ${p.title}. ${p.inclusions.join(", ")} included.`, location_name: p.location, duration_value: p.hours, duration_type: "hours", status: "published" },
        variant: { variant_name: "Standard", price_per_pax: p.price, flat_price: null, min_pax: 1, max_pax: Math.min(p.capacity, 10), is_default: true },
        stops: p.stops.map(([location_name, lat, lng], stop_order) => ({ location_name, description: null, ...pin(lat, lng), stop_order })),
        inclusions: p.inclusions.map((item_text) => ({ item_text, is_included: true })),
        availability: dates.map((available_date) => ({ available_date, capacity_total: p.capacity })),
      };
    }),
  }));
  const guides = REALISTIC_GUIDES.map((g, i) => ({
    user: user("guide", i + 1, g.name),
    guide: { bio: `Demo guide: ${g.years} years leading ${g.specialties.join(" and ")} trips around Camarines Norte.`, years_experience: g.years, specialties: g.specialties, contact_phone: `0918 200 00${String(i + 1).padStart(2, "0")}`, accreditation_status: "approved", consent_full_id_display: false },
    operators: g.operators,
    schedule: guideSchedule(i, today),
  }));
  const tourists = TOURIST_NAMES.map((name, i) => user("tourist", i + 1, name));

  // Bookings: walk tourists over packages, pick the next open date with a free, available guide.
  const busy = new Set(); // `${guide}|${date}`
  const packagesFlat = operators.flatMap((op, opIndex) => op.packages.map((p, pkgIndex) => ({ opIndex, pkgIndex, p })));
  const bookings = [];
  const kinds = ["confirmed_paid", "confirmed_partial", "confirmed", "pending"];
  let cursor = 0;
  tourists.forEach((tourist, t) => {
    const count = t % 3 === 0 ? 2 : 1;
    for (let k = 0; k < count; k++) {
      const { opIndex, pkgIndex, p } = packagesFlat[(t + k * 3) % packagesFlat.length];
      const kind = t === 9 && k === 0 ? "cancelled" : kinds[(cursor++) % kinds.length];
      const pax = 1 + ((t + k) % 4);
      let picked = null;
      for (const slot of p.availability.slice((t * 2 + k) % 5)) {
        const date = slot.available_date;
        const guideIndex = kind.startsWith("confirmed")
          ? guides.findIndex((g, gi) => g.operators.includes(opIndex) && !busy.has(`${gi}|${date}`) && g.schedule.some((s) => s.available_date === date && s.is_available))
          : -1;
        if (kind.startsWith("confirmed") && guideIndex < 0) continue;
        picked = { date, guideIndex };
        break;
      }
      if (!picked) continue;
      if (picked.guideIndex >= 0) busy.add(`${picked.guideIndex}|${picked.date}`);
      const total = p.variant.price_per_pax * pax;
      bookings.push({
        reference: `BK-DEMO-${String(bookings.length + 1).padStart(3, "0")}`,
        tourist: t,
        operator: opIndex,
        package: pkgIndex,
        tour_date: picked.date,
        number_of_pax: pax,
        status: kind === "pending" ? "pending" : kind === "cancelled" ? "cancelled" : "confirmed",
        guide: picked.guideIndex >= 0 ? picked.guideIndex : null,
        paid: kind === "confirmed_paid" ? total : kind === "confirmed_partial" ? Math.round(total / 2) : 0,
        total,
      });
    }
  });
  return { admin, operators, guides, tourists, bookings };
}

/** Creates or updates the auth user and profile; returns the user id. */
async function ensureUser(admin, existing, user, password) {
  const found = existing.get(user.email);
  const { data, error } = found
    ? await admin.auth.admin.updateUserById(found.id, { password, email_confirm: true, user_metadata: { full_name: user.full_name } })
    : await admin.auth.admin.createUser({ email: user.email, password, email_confirm: true, user_metadata: { full_name: user.full_name } });
  if (error) throw new Error(`${user.email}: ${error.message}`);
  const { error: profileError } = await admin.from("profiles").upsert({ id: data.user.id, role: user.role, full_name: user.full_name });
  if (profileError) throw new Error(`profile ${user.email}: ${profileError.message}`);
  return data.user.id;
}

async function ensurePackage(admin, operatorId, item) {
  const packageId = await upsertBy(admin, "tours_packages", { operator_id: operatorId, title: item.pkg.title }, item.pkg);
  for (const [table, rows] of [
    ["tours_package_price_variants", [item.variant]],
    ["tours_package_stops", item.stops],
    ["tours_package_inclusions", item.inclusions],
  ]) {
    const { count } = await admin.from(table).select("id", { count: "exact", head: true }).eq("package_id", packageId);
    if (!count) {
      const { error } = await admin.from(table).insert(rows.map((row) => ({ ...row, package_id: packageId })));
      if (error) throw new Error(`${table}: ${error.message}`);
    }
  }
  const { error } = await admin
    .from("tours_package_availability")
    .upsert(item.availability.map((row) => ({ ...row, package_id: packageId })), { onConflict: "package_id,available_date", ignoreDuplicates: true });
  if (error) throw new Error(`availability: ${error.message}`);
  return packageId;
}

export async function applyRealisticPlan(admin, plan, password) {
  const existing = await findUsersByEmail(admin);
  const adminId = await ensureUser(admin, existing, plan.admin, password);
  const reviewed = { reviewed_by: adminId, reviewed_at: new Date().toISOString() };

  const packageIds = [];
  for (const op of plan.operators) {
    const profileId = await ensureUser(admin, existing, op.user, password);
    const operatorId = await upsertBy(admin, "tours_operators", { profile_id: profileId }, { ...op.operator, ...reviewed });
    const ids = [];
    for (const item of op.packages) ids.push(await ensurePackage(admin, operatorId, item));
    packageIds.push(ids);
  }

  const guideIds = [];
  for (const g of plan.guides) {
    const profileId = await ensureUser(admin, existing, g.user, password);
    const guideId = await upsertBy(admin, "tours_guides", { profile_id: profileId }, { ...g.guide, ...reviewed });
    guideIds.push(guideId);
    for (const opIndex of g.operators) for (const packageId of packageIds[opIndex]) await upsertBy(admin, "tours_package_guides", { package_id: packageId, guide_id: guideId }, { is_active: true });
    // Days the guide already set are kept, so a re-run never undoes their own changes.
    const { error } = await admin
      .from("tours_guide_availability")
      .upsert(g.schedule.map((row) => ({ ...row, guide_id: guideId })), { onConflict: "guide_id,available_date", ignoreDuplicates: true });
    if (error) throw new Error(`guide availability: ${error.message}`);
  }

  const touristIds = [];
  for (const t of plan.tourists) touristIds.push(await ensureUser(admin, existing, t, password));

  let created = 0;
  for (const b of plan.bookings) {
    const { data: found } = await admin.from("tours_bookings").select("id").eq("booking_reference", b.reference).maybeSingle();
    if (found) continue; // already seeded; bookings are never rewritten
    const packageId = packageIds[b.operator][b.package];
    const { data: variant } = await admin.from("tours_package_price_variants").select("id").eq("package_id", packageId).eq("is_default", true).maybeSingle();
    const tourist = plan.tourists[b.tourist];
    // Insert as pending (the trigger forces it), then move it along like an operator would.
    const { data: row, error } = await admin
      .from("tours_bookings")
      .insert({ package_id: packageId, user_id: touristIds[b.tourist], price_variant_id: variant?.id, tour_date: b.tour_date, number_of_pax: b.number_of_pax, contact_name: tourist.full_name, contact_email: tourist.email, contact_phone: "0919 000 0000", booking_reference: b.reference })
      .select("id")
      .single();
    if (error) throw new Error(`${b.reference}: ${error.message}`);
    if (b.status !== "pending") {
      const { error: statusError } = await admin.from("tours_bookings").update(b.status === "cancelled" ? { status: "cancelled", cancellation_reason: "Demo: plans changed." } : { status: "confirmed" }).eq("id", row.id);
      if (statusError) throw new Error(`${b.reference} status: ${statusError.message}`);
    }
    if (b.guide !== null) {
      const { error: guideError } = await admin.from("tours_bookings").update({ assigned_guide_id: guideIds[b.guide] }).eq("id", row.id);
      if (guideError) throw new Error(`${b.reference} guide: ${guideError.message}`);
    }
    if (b.paid > 0) {
      const { error: payError } = await admin.from("tours_payments").insert({ booking_id: row.id, amount: b.paid, payment_method: "gcash", payment_status: "completed", provider: "manual", reference_number: `DEMO-${b.reference}`, notes: "Demo payment, no real money." });
      if (payError) throw new Error(`${b.reference} payment: ${payError.message}`);
    }
    created++;
  }
  return { created };
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

async function mainRealistic(dryRun, domain, today) {
  let plan;
  try {
    plan = buildRealisticPlan({ domain, today });
  } catch (error) {
    fail(error.message);
  }
  const accounts = 1 + plan.operators.length + plan.guides.length + plan.tourists.length;
  console.log(`Realistic demo: ${accounts} accounts (${plan.operators.length} operators, ${plan.guides.length} guides, ${plan.tourists.length} tourists, 1 admin), ${plan.operators.flatMap((o) => o.packages).length} packages, ${plan.bookings.length} bookings.`);
  if (dryRun) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }
  const { url, key, password } = credentials();
  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const { created } = await applyRealisticPlan(admin, plan, password);
  console.log(`Created ${created} new booking(s).`);
  console.log("\nCredentials sheet (print it; do not commit it). Password for every account: the DEMO_PASSWORD you set.\n");
  console.log("Role     | Name                              | Email");
  console.log("---------|-----------------------------------|------------------------------");
  for (const u of [plan.admin, ...plan.operators.map((o) => o.user), ...plan.guides.map((g) => g.user), ...plan.tourists]) console.log(`${u.role.padEnd(8)} | ${u.full_name.padEnd(33)} | ${u.email}`);
}

function credentials() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const password = process.env.DEMO_PASSWORD ?? "";
  if (!url || !key) fail("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (server key; never commit it).");
  if (password.length < 10) fail("Set DEMO_PASSWORD to at least 10 characters. It is not stored anywhere by this script.");
  return { url, key, password };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  if ((process.env.DEMO_PROFILE ?? "groups") === "realistic") {
    const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
    return mainRealistic(dryRun, (process.env.DEMO_EMAIL_DOMAIN ?? DEFAULT_DOMAIN).toLowerCase(), today);
  }
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

  const { url, key, password } = credentials();
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
