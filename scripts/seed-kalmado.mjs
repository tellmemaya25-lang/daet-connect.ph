#!/usr/bin/env node
/**
 * Kalmado Tour Services: a real operator's Calaguas listings, added with the
 * operator's consent (scripts/data/kalmado.json holds the advert's content).
 *
 * Creates (or updates) the operator login, the approved operator profile and
 * four packages: camping 2D1N and 3D2N (each from Minaogan port or with a van
 * from Manila), a day tour and boat transfer only. Each has its itinerary,
 * optional extras, inclusions, the ₱500 reservation fee and the operator's
 * cancellation terms. New packages start in "pending review", so the Tourism
 * Office approves them before tourists can book.
 *
 * Open dates are not seeded: the advert gives no capacity, so the operator
 * sets dates and seats on the availability calendar.
 *
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SECRET_KEY=... \
 *   KALMADO_EMAIL=you@example.com KALMADO_PASSWORD='a-long-password' \
 *   node scripts/seed-kalmado.mjs
 *
 *   node scripts/seed-kalmado.mjs --dry-run   # print the plan, touch nothing
 *
 * The password is never stored. Safe to re-run: rows are matched by title and
 * updated; price options that bookings already use are updated, not replaced.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const KALMADO = JSON.parse(readFileSync(join(here, "data", "kalmado.json"), "utf8"));

const itineraryRows = (rows, day) => rows.map(([time, activity]) => ({ day_number: day, start_time: time, activity }));

/** Everything the seed writes, without touching the network. */
export function buildKalmadoPlan(data = KALMADO) {
  const s = data.shared;
  return data.packages.map((p) => {
    const inclusions = p.camping ? [p.meals_note, ...s.camping_inclusions] : p.inclusions;
    const exclusions = p.camping ? s.camping_exclusions : p.exclusions ?? [];
    const itinerary = p.camping
      ? [
          ...itineraryRows(s.itinerary_day1, 1),
          ...itineraryRows(s.itinerary_day2_morning, 2),
          ...itineraryRows(p.itinerary_day2_end ?? [], 2),
          ...itineraryRows(p.itinerary_day3 ?? [], 3),
        ]
      : p.itinerary.map(([day, time, activity]) => ({ day_number: day, start_time: time, activity }));
    return {
      key: p.key,
      pkg: {
        title: p.title,
        description: p.description,
        location_name: s.location_name,
        duration_value: p.duration_value,
        duration_type: p.duration_type,
        meeting_point_name: s.meeting_point_name,
        meeting_time: s.meeting_time,
        inclusions,
        exclusions,
        things_to_bring: p.key === "boat" ? [] : s.things_to_bring,
        good_to_know: s.good_to_know,
        deposit_per_pax: p.no_deposit ? null : s.deposit_per_pax,
        deposit_refundable: p.no_deposit ? true : s.deposit_refundable,
        cancellation_policy: p.no_deposit ? null : s.cancellation_policy,
      },
      variants: p.variants.map((v) => ({
        variant_name: v.variant_name,
        price_per_pax: v.price_per_pax ?? null,
        flat_price: v.flat_price ?? null,
        min_pax: 1,
        max_pax: v.max_pax ?? null,
        is_default: v.is_default,
        child_max_age: v.child?.child_max_age ?? null,
        child_price_percent: v.child?.child_price_percent ?? null,
        group_min_pax: v.group ? s.group_rule.group_min_pax : null,
        group_discount_per_pax: v.group ? s.group_rule.group_discount_per_pax : null,
        group_free_pax: v.group ? s.group_rule.group_free_pax : null,
      })),
      inclusionRows: [
        ...inclusions.map((item_text, i) => ({ item_text, is_included: true, display_order: i + 1 })),
        ...exclusions.map((item_text, i) => ({ item_text, is_included: false, display_order: inclusions.length + i + 1 })),
      ],
      addons: (p.camping ? s.camping_addons : p.addons ?? []).map((a, i) => ({ ...a, display_order: i + 1 })),
      itinerary: itinerary.map((row, i) => ({ ...row, display_order: i + 1 })),
      stops: p.key === "boat" ? [] : s.stops.map((stop, i) => ({ ...stop, stop_order: i + 1 })),
    };
  });
}

function fail(message) {
  console.error(`✖ ${message}`);
  process.exit(1);
}

async function findUserByEmail(admin, email) {
  for (let page = 1; page < 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === email);
    if (found) return found;
    if (data.users.length < 1000) return null;
  }
  return null;
}

async function upsertBy(admin, table, match, values) {
  let query = admin.from(table).select("id");
  for (const [k, v] of Object.entries(match)) query = query.eq(k, v);
  const { data: existing, error } = await query.maybeSingle();
  if (error) throw new Error(`${table}: ${error.message}`);
  if (existing) {
    const { error: updateError } = await admin.from(table).update(values).eq("id", existing.id);
    if (updateError) throw new Error(`${table}: ${updateError.message}`);
    return { id: existing.id, created: false };
  }
  const { data, error: insertError } = await admin.from(table).insert({ ...match, ...values }).select("id").single();
  if (insertError) throw new Error(`${table}: ${insertError.message}`);
  return { id: data.id, created: true };
}

async function replaceRows(admin, table, packageId, rows) {
  const { error: deleteError } = await admin.from(table).delete().eq("package_id", packageId);
  if (deleteError) throw new Error(`${table}: ${deleteError.message}`);
  if (!rows.length) return;
  const { error } = await admin.from(table).insert(rows.map((row) => ({ ...row, package_id: packageId })));
  if (error) throw new Error(`${table}: ${error.message}`);
}

export async function applyKalmadoPlan(admin, plan, { email, password, data = KALMADO }) {
  const found = await findUserByEmail(admin, email);
  const { data: auth, error } = found
    ? await admin.auth.admin.updateUserById(found.id, { password, email_confirm: true, user_metadata: { full_name: data.user.full_name } })
    : await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: data.user.full_name } });
  if (error) throw new Error(`${email}: ${error.message}`);
  const profileId = auth.user.id;
  const { error: profileError } = await admin.from("profiles").upsert({ id: profileId, role: "operator", full_name: data.user.full_name });
  if (profileError) throw new Error(`profile: ${profileError.message}`);

  const { id: operatorId } = await upsertBy(admin, "tours_operators", { profile_id: profileId }, {
    ...data.operator,
    contact_email: email,
    reviewed_at: new Date().toISOString(),
  });

  const results = [];
  for (const item of plan) {
    // New packages wait for the Tourism Office; a re-run keeps whatever status they reached.
    const { data: existing } = await admin.from("tours_packages").select("id, status").eq("operator_id", operatorId).eq("title", item.pkg.title).maybeSingle();
    const { id: packageId } = await upsertBy(admin, "tours_packages", { operator_id: operatorId, title: item.pkg.title }, existing ? item.pkg : { ...item.pkg, status: "pending_review" });

    // Price options: update by name (bookings may point at them), add missing ones.
    for (const variant of item.variants) await upsertBy(admin, "tours_package_price_variants", { package_id: packageId, variant_name: variant.variant_name }, variant);
    await replaceRows(admin, "tours_package_inclusions", packageId, item.inclusionRows);
    await replaceRows(admin, "tours_package_addons", packageId, item.addons);
    await replaceRows(admin, "tours_package_itinerary", packageId, item.itinerary);
    await replaceRows(admin, "tours_package_stops", packageId, item.stops);
    results.push({ title: item.pkg.title, id: packageId, status: existing?.status ?? "pending_review" });
  }
  return { operatorId, results };
}

function credentials() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const email = (process.env.KALMADO_EMAIL ?? "").trim().toLowerCase();
  const password = process.env.KALMADO_PASSWORD ?? "";
  if (!url || !key) fail("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (server key; never commit it).");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail("Set KALMADO_EMAIL to the email the operator will sign in with.");
  if (password.length < 10) fail("Set KALMADO_PASSWORD to at least 10 characters. It is not stored anywhere by this script.");
  return { url, key, email, password };
}

async function main() {
  const plan = buildKalmadoPlan();
  console.log(`Kalmado Tour Services: 1 operator account, ${plan.length} packages (${plan.map((p) => p.pkg.title).join("; ")}).`);
  if (process.argv.includes("--dry-run")) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }
  const { url, key, email, password } = credentials();
  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const { results } = await applyKalmadoPlan(admin, plan, { email, password });
  console.log(`\nOperator login: ${email} (password: the KALMADO_PASSWORD you set).`);
  for (const r of results) console.log(`  ${r.status.padEnd(15)} ${r.title}`);
  console.log("\nNext: approve the packages in Tourism Office → Packages, then the operator opens dates on each package's calendar.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => fail(error.message ?? String(error)));
}
