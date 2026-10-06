// Run against isolated in-memory PostgreSQL, never the project's database.
// node scripts/test-trade-cost-migration.mjs <path-to-pglite/dist/index.js>
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const { PGlite } = await import(process.argv[2] ? pathToFileURL(process.argv[2]).href : '@electric-sql/pglite');
const db = new PGlite();
try {
  const initial = await readFile(new URL('../supabase/migrations/0001_init.sql', import.meta.url), 'utf8');
  const migration = await readFile(new URL('../supabase/migrations/0011_trade_cost_excludes_fees.sql', import.meta.url), 'utf8');
  await db.exec('create schema auth; create table auth.users (id uuid primary key); create role anon; create role authenticated; create role service_role;');
  await db.exec(initial.slice(initial.indexOf('create table if not exists profiles'), initial.indexOf('create table if not exists watchlist')));
  await db.exec(initial.slice(initial.indexOf('create or replace function public.execute_trade'), initial.indexOf('create or replace function public.reset_portfolio')));
  const users = ['10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002'];
  for (const id of users) {
    await db.query('insert into auth.users values ($1)', [id]);
    await db.query('insert into profiles (id) values ($1)', [id]);
  }
  await db.exec("insert into stocks (symbol, name) values ('MSFT', 'Microsoft'), ('AAPL', 'Apple');");
  let sequence = 0;
  async function trade(user, symbol, side, quantity, price, fee, clientId = crypto.randomUUID()) {
    const { rows } = await db.query('select (execute_trade($1, $2, $3, $4, $5, $6, $6, $7)).*', [user, clientId, symbol, side, quantity, price, fee]);
    sequence += 1;
    await db.query("update orders set created_at = '2026-01-01'::timestamptz + $1 * interval '1 second' where id = $2", [sequence, rows[0].id]);
    return rows[0];
  }
  await trade(users[0], 'MSFT', 'buy', 100, 528.9844, 52.9);
  await trade(users[1], 'AAPL', 'buy', 10, 100, 1);
  await trade(users[1], 'AAPL', 'sell', 4, 110, 0.5);
  await trade(users[1], 'AAPL', 'buy', 4, 120, 0.5);
  await trade(users[1], 'MSFT', 'buy', 1, 100, 0.5);
  await trade(users[1], 'MSFT', 'sell', 1, 105, 0.5);
  await trade(users[1], 'MSFT', 'buy', 0.000123, 528.9844, 0.5);
  // Historical, already-reset session must not alter current holdings/cash.
  await db.query(`insert into orders (client_order_id, user_id, symbol, side, quantity, quoted_price, price, fee, portfolio_session_id, created_at)
    values (gen_random_uuid(), $1, 'AAPL', 'buy', 3, 50, 50, 0.5, gen_random_uuid(), '2025-01-01')`, [users[0]]);
  const before = (await db.query('select id, cash_balance from profiles order by id')).rows;
  const quantities = (await db.query('select user_id, symbol, quantity from holdings order by user_id, symbol')).rows;
  await db.exec(migration);
  assert.deepEqual((await db.query('select id, cash_balance from profiles order by id')).rows, before);
  assert.deepEqual((await db.query('select user_id, symbol, quantity from holdings order by user_id, symbol')).rows, quantities);
  const holdings = (await db.query('select user_id, symbol, avg_cost from holdings order by user_id, symbol')).rows;
  assert.equal(Number(holdings.find((h) => h.user_id === users[0]).avg_cost), 528.9844);
  assert.equal(Number(holdings.find((h) => h.user_id === users[1] && h.symbol === 'AAPL').avg_cost), 108);
  assert.equal(Number(holdings.find((h) => h.user_id === users[1] && h.symbol === 'MSFT').avg_cost), 528.9844);
  assert.equal(Number((await db.query('select realized_pl from profiles where id = $1', [users[0]])).rows[0].realized_pl), -52.9);
  assert.equal(Number((await db.query('select realized_pl from profiles where id = $1', [users[1]])).rows[0].realized_pl), 41.5);
  console.log('PASS: historical cost replay, partial sells, weighted buys, full sell/rebuy, fractional shares, and session isolation; no cash/share changes');
  await db.exec(migration);
  assert.deepEqual((await db.query('select id, cash_balance from profiles order by id')).rows, before);
  assert.deepEqual((await db.query('select user_id, symbol, avg_cost from holdings order by user_id, symbol')).rows, holdings);
  console.log('PASS: rerunning migration does not double-charge fees or change costs');

  const clientId = crypto.randomUUID();
  const order = await trade(users[0], 'AAPL', 'buy', 1, 100, 0.5, clientId);
  assert.equal(Number(order.realized_pl), -0.5);
  const afterBuy = (await db.query('select cash_balance, realized_pl from profiles where id = $1', [users[0]])).rows[0];
  assert.equal(Number(afterBuy.cash_balance), Number(before[0].cash_balance) - 100.5);
  assert.equal(Number(afterBuy.realized_pl), -53.4);
  assert.equal(Number((await db.query('select avg_cost from holdings where user_id = $1 and symbol = $2', [users[0], 'AAPL'])).rows[0].avg_cost), 100);
  const duplicate = await trade(users[0], 'AAPL', 'buy', 1, 100, 0.5, clientId);
  assert.equal(duplicate.id, order.id);
  assert.deepEqual((await db.query('select cash_balance, realized_pl from profiles where id = $1', [users[0]])).rows[0], afterBuy);
  await trade(users[0], 'AAPL', 'sell', 1, 110, 0.5);
  const afterSell = (await db.query('select cash_balance, realized_pl from profiles where id = $1', [users[0]])).rows[0];
  assert.equal(Number(afterSell.cash_balance), Number(before[0].cash_balance) + 9);
  assert.equal(Number(afterSell.realized_pl), -43.9);
  await assert.rejects(trade(users[0], 'AAPL', 'sell', 1, 110, 0.5), /INSUFFICIENT_SHARES/);
  await assert.rejects(trade(users[0], 'AAPL', 'buy', 10000, 110, 0.5), /INSUFFICIENT_CASH/);
  assert.deepEqual((await db.query('select cash_balance, realized_pl from profiles where id = $1', [users[0]])).rows[0], afterSell);
  console.log('PASS: new trades debit fees once, sells realize net P/L, duplicate IDs are idempotent, and rejected trades leave balances unchanged');
  const privileges = (await db.query("select has_function_privilege('anon', 'execute_trade(uuid,uuid,text,text,numeric,numeric,numeric,numeric)', 'execute') as anon, has_function_privilege('service_role', 'execute_trade(uuid,uuid,text,text,numeric,numeric,numeric,numeric)', 'execute') as service")).rows[0];
  assert.deepEqual(privileges, { anon: false, service: true });
  await db.query("update holdings set quantity = quantity + 1, avg_cost = 777 where user_id = $1 and symbol = 'MSFT'", [users[0]]);
  await db.query('update orders set realized_pl = 123 where id = $1', [order.id]);
  await assert.rejects(db.exec(migration), /holdings do not match order history/);
  await db.exec('rollback');
  assert.equal(Number((await db.query('select realized_pl from orders where id = $1', [order.id])).rows[0].realized_pl), 123);
  assert.equal(Number((await db.query("select avg_cost from holdings where user_id = $1 and symbol = 'MSFT'", [users[0]])).rows[0].avg_cost), 777);
  assert.deepEqual((await db.query('select cash_balance, realized_pl from profiles where id = $1', [users[0]])).rows[0], afterSell);
  console.log('PASS: service-only permissions preserved; incomplete ledger aborts and rolls back the entire migration');
} finally {
  await db.close();
}
