create extension if not exists "pgcrypto";

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Trader',
  currency text not null default 'USD',
  cash_balance numeric(18,2) not null default 100000 check (cash_balance >= 0),
  starting_balance numeric(18,2) not null default 100000,
  realized_pl numeric(18,2) not null default 0,
  reset_count integer not null default 0 check (reset_count >= 0),
  current_session_id uuid not null default gen_random_uuid(),
  session_started_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists stocks (
  symbol text primary key,
  name text not null,
  exchange text,
  market text not null default 'US',
  currency text not null default 'USD',
  logo_url text,
  is_active boolean not null default true
);
create index if not exists stocks_name_idx on stocks using gin (to_tsvector('simple', name));
create index if not exists stocks_symbol_prefix_idx on stocks (symbol text_pattern_ops);

create table if not exists holdings (
  user_id uuid references profiles(id) on delete cascade,
  symbol text references stocks(symbol),
  quantity numeric(18,6) not null check (quantity > 0),
  avg_cost numeric(18,4) not null check (avg_cost >= 0),
  primary key (user_id, symbol)
);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  client_order_id uuid not null,
  user_id uuid not null references profiles(id) on delete cascade,
  symbol text not null references stocks(symbol),
  side text not null check (side in ('buy','sell')),
  quantity numeric(18,6) not null check (quantity > 0),
  quoted_price numeric(18,4) not null check (quoted_price > 0),
  price numeric(18,4) not null check (price > 0),
  fee numeric(18,2) not null default 0,
  realized_pl numeric(18,2) not null default 0,
  portfolio_session_id uuid not null,
  created_at timestamptz not null default now(),
  unique (user_id, client_order_id)
);
create index if not exists orders_user_idx on orders (user_id, created_at desc);

create table if not exists watchlist (
  user_id uuid references profiles(id) on delete cascade,
  symbol text references stocks(symbol),
  created_at timestamptz not null default now(),
  primary key (user_id, symbol)
);

create table if not exists quotes_cache (
  symbol text primary key,
  price numeric(18,4) not null,
  prev_close numeric(18,4) not null,
  change numeric(18,4) not null,
  change_pct numeric(10,4) not null,
  open numeric(18,4), high numeric(18,4), low numeric(18,4), volume bigint,
  updated_at timestamptz not null default now()
);

create table if not exists fundamentals_cache (
  symbol text primary key,
  market_cap numeric(24,2), eps_ttm numeric(18,4), week52_high numeric(18,4), week52_low numeric(18,4),
  dividend_yield numeric(10,4), sector text, updated_at timestamptz not null default now()
);

create table if not exists candles_cache (
  symbol text not null,
  range text not null check (range in ('1D','1W','1M','1Y')),
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (symbol, range)
);

create table if not exists portfolio_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  portfolio_session_id uuid not null,
  snapshot_at timestamptz not null default now(),
  snapshot_date date not null,
  portfolio_value numeric(18,2) not null,
  total_pl_pct numeric(10,4) not null,
  unique (user_id, portfolio_session_id, snapshot_date, snapshot_at)
);
create index if not exists portfolio_snapshots_user_time_idx on portfolio_snapshots (user_id, snapshot_at desc);

create table if not exists lesson_progress (
  user_id uuid references profiles(id) on delete cascade,
  lesson_id text not null,
  completed_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

alter table profiles enable row level security;
alter table stocks enable row level security;
alter table holdings enable row level security;
alter table orders enable row level security;
alter table watchlist enable row level security;
alter table quotes_cache enable row level security;
alter table fundamentals_cache enable row level security;
alter table candles_cache enable row level security;
alter table portfolio_snapshots enable row level security;
alter table lesson_progress enable row level security;

drop policy if exists profiles_select_own on profiles;
create policy profiles_select_own on profiles for select using (auth.uid() = id);
drop policy if exists profiles_update_name on profiles;
create policy profiles_update_name on profiles for update using (auth.uid() = id) with check (auth.uid() = id);
revoke update on table profiles from authenticated;
grant update (display_name) on table profiles to authenticated;
grant select on table profiles, holdings, orders, watchlist, portfolio_snapshots, lesson_progress to authenticated;

drop policy if exists stocks_public_select on stocks;
create policy stocks_public_select on stocks for select using (true);
drop policy if exists quotes_public_select on quotes_cache;
create policy quotes_public_select on quotes_cache for select using (true);
drop policy if exists fundamentals_public_select on fundamentals_cache;
create policy fundamentals_public_select on fundamentals_cache for select using (true);
drop policy if exists candles_public_select on candles_cache;
create policy candles_public_select on candles_cache for select using (true);
grant select on table stocks, quotes_cache, fundamentals_cache, candles_cache to anon, authenticated;

drop policy if exists holdings_select_own on holdings;
create policy holdings_select_own on holdings for select using (auth.uid() = user_id);
drop policy if exists orders_select_own on orders;
create policy orders_select_own on orders for select using (auth.uid() = user_id);
drop policy if exists watchlist_select_own on watchlist;
create policy watchlist_select_own on watchlist for select using (auth.uid() = user_id);
drop policy if exists watchlist_insert_own on watchlist;
create policy watchlist_insert_own on watchlist for insert with check (auth.uid() = user_id);
drop policy if exists watchlist_delete_own on watchlist;
create policy watchlist_delete_own on watchlist for delete using (auth.uid() = user_id);
grant insert, delete on table watchlist to authenticated;
drop policy if exists snapshots_select_own on portfolio_snapshots;
create policy snapshots_select_own on portfolio_snapshots for select using (auth.uid() = user_id);
drop policy if exists lesson_select_own on lesson_progress;
create policy lesson_select_own on lesson_progress for select using (auth.uid() = user_id);
drop policy if exists lesson_insert_own on lesson_progress;
create policy lesson_insert_own on lesson_progress for insert with check (auth.uid() = user_id);
drop policy if exists lesson_update_own on lesson_progress;
create policy lesson_update_own on lesson_progress for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant insert, update on table lesson_progress to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_profile public.profiles;
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), split_part(coalesce(new.email, 'Trader'), '@', 1)))
  returning * into v_profile;
  insert into public.portfolio_snapshots (user_id, portfolio_session_id, snapshot_date, portfolio_value, total_pl_pct)
  values (v_profile.id, v_profile.current_session_id, current_date, v_profile.starting_balance, 0);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.execute_trade(
  p_user_id uuid,
  p_client_order_id uuid,
  p_symbol text,
  p_side text,
  p_quantity numeric,
  p_quoted_price numeric,
  p_execution_price numeric,
  p_fee numeric
) returns public.orders
language plpgsql
security definer set search_path = public
as $$
declare
  v_profile public.profiles;
  v_stock public.stocks;
  v_holding public.holdings;
  v_order public.orders;
  v_trade_value numeric(18,2);
  v_realized numeric(18,2) := 0;
  v_remaining numeric(18,6);
  v_new_avg numeric(18,4);
begin
  if p_side not in ('buy', 'sell') then raise exception using errcode = 'P0001', message = 'INVALID_SIDE'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception using errcode = 'P0001', message = 'INVALID_QUANTITY'; end if;
  if p_quoted_price is null or p_quoted_price <= 0 or p_execution_price is null or p_execution_price <= 0 then raise exception using errcode = 'P0001', message = 'INVALID_PRICE'; end if;
  if p_fee is null or p_fee < 0 then raise exception using errcode = 'P0001', message = 'INVALID_FEE'; end if;

  select * into v_profile from public.profiles where id = p_user_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'PROFILE_NOT_FOUND'; end if;

  select * into v_order from public.orders where user_id = p_user_id and client_order_id = p_client_order_id;
  if found then return v_order; end if;

  select * into v_stock from public.stocks where symbol = upper(p_symbol) and is_active = true;
  if not found then raise exception using errcode = 'P0001', message = 'STOCK_NOT_FOUND'; end if;

  v_trade_value := round(p_quantity * p_execution_price, 2);
  if p_side = 'buy' then
    if v_profile.cash_balance < v_trade_value + p_fee then raise exception using errcode = 'P0001', message = 'INSUFFICIENT_CASH'; end if;
    select * into v_holding from public.holdings where user_id = p_user_id and symbol = upper(p_symbol);
    if found then
      v_new_avg := round(((v_holding.quantity * v_holding.avg_cost) + v_trade_value + p_fee) / (v_holding.quantity + p_quantity), 4);
      update public.holdings set quantity = quantity + p_quantity, avg_cost = v_new_avg where user_id = p_user_id and symbol = upper(p_symbol);
    else
      insert into public.holdings (user_id, symbol, quantity, avg_cost) values (p_user_id, upper(p_symbol), p_quantity, round((v_trade_value + p_fee) / p_quantity, 4));
    end if;
    update public.profiles set cash_balance = cash_balance - v_trade_value - p_fee where id = p_user_id;
  else
    select * into v_holding from public.holdings where user_id = p_user_id and symbol = upper(p_symbol);
    if not found or v_holding.quantity < p_quantity then raise exception using errcode = 'P0001', message = 'INSUFFICIENT_SHARES'; end if;
    v_realized := round((p_execution_price - v_holding.avg_cost) * p_quantity - p_fee, 2);
    v_remaining := v_holding.quantity - p_quantity;
    if v_remaining < 0.000001 then
      delete from public.holdings where user_id = p_user_id and symbol = upper(p_symbol);
    else
      update public.holdings set quantity = v_remaining where user_id = p_user_id and symbol = upper(p_symbol);
    end if;
    update public.profiles set cash_balance = cash_balance + v_trade_value - p_fee, realized_pl = realized_pl + v_realized where id = p_user_id;
  end if;

  insert into public.orders (client_order_id, user_id, symbol, side, quantity, quoted_price, price, fee, realized_pl, portfolio_session_id)
  values (p_client_order_id, p_user_id, upper(p_symbol), p_side, p_quantity, p_quoted_price, p_execution_price, p_fee, v_realized, v_profile.current_session_id)
  returning * into v_order;
  return v_order;
exception when unique_violation then
  select * into v_order from public.orders where user_id = p_user_id and client_order_id = p_client_order_id;
  if found then return v_order; end if;
  raise;
end;
$$;

create or replace function public.reset_portfolio(p_user_id uuid)
returns public.profiles
language plpgsql
security definer set search_path = public
as $$
declare
  v_profile public.profiles;
begin
  select * into v_profile from public.profiles where id = p_user_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'PROFILE_NOT_FOUND'; end if;
  delete from public.holdings where user_id = p_user_id;
  update public.profiles set cash_balance = starting_balance, realized_pl = 0, reset_count = reset_count + 1, current_session_id = gen_random_uuid(), session_started_at = now() where id = p_user_id returning * into v_profile;
  insert into public.portfolio_snapshots (user_id, portfolio_session_id, snapshot_date, portfolio_value, total_pl_pct)
  values (p_user_id, v_profile.current_session_id, current_date, v_profile.starting_balance, 0);
  return v_profile;
end;
$$;

revoke all on function public.execute_trade(uuid, uuid, text, text, numeric, numeric, numeric, numeric) from public, anon, authenticated;
grant execute on function public.execute_trade(uuid, uuid, text, text, numeric, numeric, numeric, numeric) to service_role;
revoke all on function public.reset_portfolio(uuid) from public, anon, authenticated;
grant execute on function public.reset_portfolio(uuid) to service_role;
