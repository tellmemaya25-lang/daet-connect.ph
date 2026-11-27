import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('retention deletes only expired archives and rolls back failed accounts', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users (id uuid PRIMARY KEY);
      CREATE TABLE public.profiles (id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE, archived_at timestamptz);
      CREATE TABLE public.blocked (user_id uuid REFERENCES auth.users(id));
    `);
    const migration = await readFile(new URL('../supabase/migrations/20261221_account_archive_retention.sql', import.meta.url), 'utf8');
    // pg_cron is not available in PGlite; exercise the actual cleanup function.
    await db.exec(migration.split('CREATE EXTENSION IF NOT EXISTS pg_cron')[0]);
    await db.exec(`
      INSERT INTO auth.users (id) VALUES
        ('00000000-0000-0000-0000-000000000001'), ('00000000-0000-0000-0000-000000000002'),
        ('00000000-0000-0000-0000-000000000003'), ('00000000-0000-0000-0000-000000000004');
      INSERT INTO profiles VALUES
        ('00000000-0000-0000-0000-000000000001', now() - interval '91 days'),
        ('00000000-0000-0000-0000-000000000002', now() - interval '89 days'),
        ('00000000-0000-0000-0000-000000000003', NULL),
        ('00000000-0000-0000-0000-000000000004', now() - interval '91 days');
      INSERT INTO blocked VALUES ('00000000-0000-0000-0000-000000000004');
      SELECT public.tours_cleanup_expired_archives();
    `);
    const users = await db.query('SELECT id FROM auth.users ORDER BY id');
    assert.deepEqual(users.rows.map(r => r.id.slice(-1)), ['2', '3', '4']);
    const profiles = await db.query('SELECT id FROM profiles ORDER BY id');
    assert.deepEqual(profiles.rows.map(r => r.id.slice(-1)), ['2', '3', '4']);
    const logs = await db.query('SELECT outcome, error_code FROM tours_archive_cleanup_log ORDER BY outcome');
    assert.deepEqual(logs.rows, [{ outcome: 'deleted', error_code: null }, { outcome: 'failed', error_code: '23503' }]);
    const privileges = await db.query("SELECT has_function_privilege('authenticated', 'public.tours_cleanup_expired_archives()', 'EXECUTE') AS allowed");
    assert.equal(privileges.rows[0].allowed, false);
  } finally {
    await db.close();
  }
});
