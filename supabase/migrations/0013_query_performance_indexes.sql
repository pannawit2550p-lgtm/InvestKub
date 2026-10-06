-- Additive only; inspect live plans first. Ordinary CREATE INDEX briefly blocks
-- writes: run off peak. For large tables, a DBA should build each index with
-- CONCURRENTLY as a separate statement outside a transaction instead.
begin;
create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;
set local search_path = public, extensions, pg_catalog;

-- Existing full-text name GIN/text_pattern_ops do not match the current ILIKE OR.
create index if not exists stocks_us_symbol_trgm_idx
  on public.stocks using gin (symbol gin_trgm_ops) where market = 'US';
create index if not exists stocks_us_name_trgm_idx
  on public.stocks using gin (name gin_trgm_ops) where market = 'US';

-- Include the existing deterministic pagination tie-breakers.
create index if not exists orders_user_created_id_idx
  on public.orders (user_id, created_at desc, id desc);
create index if not exists orders_user_symbol_created_id_idx
  on public.orders (user_id, symbol, created_at desc, id desc);
create index if not exists lesson_rewards_user_time_id_idx
  on public.lesson_progress (user_id, reward_claimed_at desc, lesson_id desc)
  where reward_claimed_at is not null;

-- holdings(user_id,symbol), profiles(id), snapshots(user_id,snapshot_at)
-- already have matching PK/index definitions: do not add duplicates for them.
commit;
