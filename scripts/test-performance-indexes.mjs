// Isolated PostgreSQL fixture, never the live Supabase database.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const modulePath = process.argv[2];
const { PGlite } = await import(pathToFileURL(modulePath).href);
const { pg_trgm } = await import(pathToFileURL(path.join(path.dirname(modulePath), 'contrib/pg_trgm.js')).href);
const db = new PGlite({ extensions: { pg_trgm } });
try {
  await db.exec(`create table stocks(symbol text primary key, name text, market text);
    create table orders(id uuid primary key, user_id uuid, symbol text, created_at timestamptz);
    create table lesson_progress(user_id uuid, lesson_id text, reward_claimed_at timestamptz, primary key(user_id,lesson_id));
    insert into stocks select 'SYM'||lpad(i::text,6,'0'),case when i=200 then 'Apple Test Corporation' else 'Company '||i end,'US' from generate_series(1,10000)i;
    insert into stocks values('AAPL','Apple Inc.','US');`);
  const migration = await readFile('supabase/migrations/0013_query_performance_indexes.sql','utf8');
  const before = await db.query("select symbol from stocks where market='US' and (symbol ilike 'APP%' or name ilike '%Apple%') order by symbol limit 20");
  await db.exec(migration); await db.exec(migration);
  const indexes = await db.query("select indexname from pg_indexes where indexname in ('stocks_us_symbol_trgm_idx','stocks_us_name_trgm_idx','orders_user_created_id_idx','orders_user_symbol_created_id_idx','lesson_rewards_user_time_id_idx')");
  assert.equal(indexes.rows.length,5);
  const after = await db.query("select symbol from stocks where market='US' and (symbol ilike 'APP%' or name ilike '%Apple%') order by symbol limit 20");
  assert.deepEqual(after.rows,before.rows);
  await db.exec('analyze stocks');
  const plan = await db.query("explain (format json) select symbol from stocks where market='US' and (symbol ilike 'APP%' or name ilike '%Apple%') order by symbol limit 20");
  const planText = JSON.stringify(plan.rows);
  assert.ok(planText.includes('stocks_us_name_trgm_idx') && planText.includes('stocks_us_symbol_trgm_idx'));
  console.log('PASS: migration runs twice; 5 indexes exist; search results unchanged; trigram BitmapOr plan selected on 10,001-row fixture');
} finally { await db.close(); }
