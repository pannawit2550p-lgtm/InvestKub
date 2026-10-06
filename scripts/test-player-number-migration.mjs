import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
try {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table profiles (id uuid primary key default gen_random_uuid(), created_at timestamptz default now(), player_number bigint);
    insert into profiles (created_at, player_number) values ('2026-01-01', 4321), ('2026-01-02', null), ('2026-01-03', null);`);
  const sql = await readFile(new URL('../supabase/migrations/0012_profile_player_number.sql', import.meta.url), 'utf8');
  await db.exec(sql);
  const rows = (await db.query('select id, player_number from profiles order by created_at')).rows;
  assert.deepEqual(rows.map((row) => Number(row.player_number)), [4321, 4322, 4323]);
  await db.exec(sql);
  assert.deepEqual((await db.query('select id, player_number from profiles order by created_at')).rows, rows);
  const inserted = await Promise.all(Array.from({ length: 12 }, () => db.query('insert into profiles default values returning player_number')));
  const numbers = inserted.map((result) => Number(result.rows[0].player_number));
  assert.equal(new Set(numbers).size, 12);
  assert.ok(Math.min(...numbers) > 4323);
  await assert.rejects(db.exec('insert into profiles (player_number) values (4321)'), /duplicate key/);
  console.log('PASS: existing player number preserved, all old accounts backfilled, rerun stable, new accounts unique, duplicate constraint enforced; no UUID used as display ID');
} finally { await db.close(); }
