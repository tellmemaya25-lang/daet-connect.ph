import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migration = await readFile(new URL("../supabase/migrations/20261201_admin_accreditation_notifications.sql", import.meta.url), "utf8");
const admin1 = "10000000-0000-4000-8000-000000000001";
const admin2 = "10000000-0000-4000-8000-000000000002";
const applicant = "20000000-0000-4000-8000-000000000001";
const guide = "30000000-0000-4000-8000-000000000001";
const operator = "40000000-0000-4000-8000-000000000001";

async function database() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$
      SELECT NULLIF(current_setting('test.user_id', true), '')::uuid
    $$;
    CREATE TABLE public.profiles (id uuid PRIMARY KEY, role text NOT NULL);
    CREATE TABLE public.tours_notifications (profile_id uuid, type text, title text, body text, link text);
    CREATE TABLE public.tours_operators (id uuid PRIMARY KEY, profile_id uuid, accreditation_status text, business_name text);
    CREATE TABLE public.tours_guides (id uuid PRIMARY KEY, profile_id uuid, accreditation_status text);
    CREATE TABLE public.tours_guide_sensitive_info (guide_id uuid PRIMARY KEY, id_document_path text NOT NULL, id_number text);
    CREATE FUNCTION public.tours_notify(p_profile_id uuid, p_type text, p_title text, p_body text, p_link text)
    RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
    BEGIN
      IF p_profile_id IS NULL OR p_profile_id = auth.uid() THEN RETURN; END IF;
      INSERT INTO tours_notifications VALUES (p_profile_id, p_type, p_title, p_body, p_link);
    END $$;
    INSERT INTO profiles VALUES ('${admin1}', 'admin'), ('${admin2}', 'admin'), ('${applicant}', 'tourist');
    -- Existing applications must not get backfilled on migration.
    INSERT INTO tours_operators VALUES ('${operator}', '${applicant}', 'approved', 'Private operator name');
    INSERT INTO tours_guides VALUES ('${guide}', '${applicant}', 'pending');
  `);
  await db.exec(migration);
  return db;
}
async function notifications(db) {
  return (await db.query("SELECT profile_id::text, type, title, body, link FROM tours_notifications ORDER BY profile_id, type")).rows;
}

test("operator submissions and resubmissions notify all admins, not other users", async () => {
  const db = await database();
  try {
    assert.deepEqual(await notifications(db), []);
    await db.exec(`INSERT INTO tours_operators VALUES (gen_random_uuid(), '${applicant}', 'pending', 'Private operator name')`);
    let rows = await notifications(db);
    assert.deepEqual(rows.map((r) => r.profile_id), [admin1, admin2]);
    assert.ok(rows.every((r) => r.type === "operator_application_submitted" && r.link === "/tours/admin/operators"));
    assert.ok(rows.every((r) => !JSON.stringify(r).includes("Private operator name")));
    await db.exec(`UPDATE tours_operators SET business_name = 'Renamed' WHERE id = '${operator}';
      UPDATE tours_operators SET accreditation_status = 'pending' WHERE id = '${operator}';
      UPDATE tours_operators SET accreditation_status = 'pending' WHERE id = '${operator}';
      UPDATE tours_operators SET accreditation_status = 'rejected' WHERE id = '${operator}';
      UPDATE tours_operators SET accreditation_status = 'pending' WHERE id = '${operator}';`);
    rows = await notifications(db);
    assert.equal(rows.length, 6); // one per admin for each of the three submissions
  } finally { await db.close(); }
});

test("guide notification waits for a successful private write and covers resubmissions without exposing identity", async () => {
  const db = await database();
  try {
    // A pending public row alone is not proof that the private write succeeded.
    assert.deepEqual(await notifications(db), []);
    await assert.rejects(db.exec(`INSERT INTO tours_guide_sensitive_info VALUES ('${guide}', NULL, 'secret-id')`));
    assert.deepEqual(await notifications(db), []);
    await db.exec(`INSERT INTO tours_guide_sensitive_info VALUES ('${guide}', 'private/id-1', 'secret-id')`);
    let rows = await notifications(db);
    assert.deepEqual(rows.map((r) => r.profile_id), [admin1, admin2]);
    assert.ok(rows.every((r) => r.type === "guide_application_submitted" && r.link === "/tours/admin/guides"));
    assert.ok(rows.every((r) => !/secret-id|private\/id-1/.test(JSON.stringify(r))));
    await db.exec(`UPDATE tours_guide_sensitive_info SET id_number = 'other-secret' WHERE guide_id = '${guide}';
      UPDATE tours_guides SET accreditation_status = 'approved' WHERE id = '${guide}';
      UPDATE tours_guide_sensitive_info SET id_document_path = 'private/id-2' WHERE guide_id = '${guide}';`);
    assert.equal((await notifications(db)).length, 2);
    await db.exec(`UPDATE tours_guides SET accreditation_status = 'pending' WHERE id = '${guide}';
      UPDATE tours_guide_sensitive_info SET id_document_path = 'private/id-3' WHERE guide_id = '${guide}';
      UPDATE tours_guide_sensitive_info SET id_document_path = 'private/id-3' WHERE guide_id = '${guide}';`);
    assert.equal((await notifications(db)).length, 4);
    await assert.rejects(db.transaction(async (tx) => {
      await tx.exec(`UPDATE tours_guide_sensitive_info SET id_document_path = 'private/rolled-back' WHERE guide_id = '${guide}'`);
      throw new Error("roll back submission");
    }));
    assert.equal((await notifications(db)).length, 4);
  } finally { await db.close(); }
});

test("notification functions cannot be called by anonymous or authenticated users", async () => {
  const db = await database();
  try {
    const result = await db.query(`SELECT
      has_function_privilege('anon', 'public.tours_notify_admin_guide_application()', 'EXECUTE') AS guide_anon,
      has_function_privilege('authenticated', 'public.tours_notify_admin_guide_application()', 'EXECUTE') AS guide_user,
      has_function_privilege('anon', 'public.tours_notify_admin_operator_application()', 'EXECUTE') AS operator_anon,
      has_function_privilege('authenticated', 'public.tours_notify_admin_operator_application()', 'EXECUTE') AS operator_user`);
    assert.deepEqual(result.rows[0], { guide_anon: false, guide_user: false, operator_anon: false, operator_user: false });
  } finally { await db.close(); }
});
