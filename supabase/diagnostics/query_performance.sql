-- Run in Supabase SQL Editor. Read-only; never enables public EXPLAIN access.
begin read only;
select tablename, indexname, indexdef from pg_indexes
where schemaname = 'public' and tablename in
  ('stocks', 'orders', 'lesson_progress', 'holdings', 'portfolio_snapshots', 'profiles')
order by tablename, indexname;

select relname, n_live_tup, seq_scan, idx_scan, last_analyze, last_autoanalyze
from pg_stat_user_tables
where relname in ('stocks', 'orders', 'lesson_progress', 'holdings', 'portfolio_snapshots', 'profiles');

explain (analyze, buffers)
select symbol, name, exchange, currency, logo_url from public.stocks
where market = 'US' and (symbol ilike 'APP%' or name ilike '%Apple%')
order by symbol limit 20;

-- Replace the zero UUID with your test user's ID before measuring their reads.
explain (analyze, buffers)
select id, symbol, created_at from public.orders
where user_id = '00000000-0000-0000-0000-000000000000'
order by created_at desc, id desc limit 21;

explain (analyze, buffers)
select snapshot_at, snapshot_date, portfolio_value, portfolio_session_id
from public.portfolio_snapshots
where user_id = '00000000-0000-0000-0000-000000000000'
order by snapshot_at desc limit 365;
commit;
