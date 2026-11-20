import assert from "node:assert/strict";
import test from "node:test";
import { isReadOnly } from "../.claude/hooks/readonly-sql.mjs";

const allowed = [
  "select 1",
  "select count(*) from tours_bookings where status = 'confirmed'",
  `select 'idx_one_active' k, exists(select 1 from pg_indexes where indexname='tours_bookings_one_active_per_tourist') v
   union all select 't_'||t, to_regclass('public.'||t) is not null from unnest(array['tours_live_sessions','tours_live_flares']) t
   union all select 'fn_'||f, exists(select 1 from pg_proc where proname=f) from unnest(array['tours_live_ping','tours_live_end']) f`,
  "with c as (select status, count(*) n from tours_bookings group by 1) select * from c order by n desc limit 5",
  "select comment from tours_reviews where is_deleted is false", // a column named like a keyword, and "deleted" inside a name
  "select 'drop table x; delete from y' as note", // keywords inside a string literal
  "select 1 -- insert into x\n",
  "select pg_get_functiondef(p.oid) from pg_proc p where p.proname = 'tours_operator_activity'",
  "select 1; select 2",
];

const refused = [
  ["empty", ""],
  ["insert", "insert into tours_events(title) values ('x')"],
  ["update", "update tours_bookings set status = 'cancelled'"],
  ["delete", "delete from tours_bookings"],
  ["drop", "drop table tours_bookings"],
  ["alter", "alter table tours_bookings add column x int"],
  ["create function", "create or replace function f() returns int language sql as $$ select 1 $$"],
  ["grant", "grant all on tours_bookings to anon"],
  ["select into", "select * into backup_bookings from tours_bookings"],
  ["data-modifying CTE", "with d as (delete from tours_bookings returning *) select count(*) from d"],
  ["a read hiding a write after a semicolon", "select 1; update tours_bookings set status = 'x'"],
  ["for update lock", "select * from tours_bookings for update"],
  ["project RPC with side effects", "select tours_admin_clear_expired_bans()"],
  ["server file read", "select pg_read_file('/etc/passwd')"],
  ["secrets schema", "select email, encrypted_password from auth.users"],
  ["vault", "select * from vault.decrypted_secrets"],
  ["unterminated string", "select 'abc"],
  ["unterminated comment", "select 1 /* never closed"],
  ["escape string", "select E'\\'; drop table x; --'"],
  ["set_config", "select set_config('role', 'service_role', false)"],
  ["explain analyze of a write", "explain analyze delete from tours_bookings"],
  ["do block", "do $$ begin delete from tours_bookings; end $$"],
  ["notify", "notify chan"],
];

for (const sql of allowed) test(`approves: ${sql.slice(0, 60).replace(/\s+/g, " ")}`, () => assert.equal(isReadOnly(sql), true));
for (const [name, sql] of refused) test(`asks instead: ${name}`, () => assert.equal(isReadOnly(sql), false));
