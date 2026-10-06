-- Purchase cost is execution price only; fees are cash expenses.
-- Replay the ledger to repair existing averages without debiting cash again.
-- Run once through migrations (or Supabase SQL Editor). All changes are atomic.
begin;
lock table public.profiles, public.holdings, public.orders in share row exclusive mode;

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
  v_holding public.holdings;
  v_order public.orders;
  v_trade_value numeric(18,2);
  v_realized numeric(18,2) := 0;
  v_remaining numeric(18,6);
  v_new_avg numeric(18,4);
begin
  if p_side not in ('buy', 'sell') then raise exception 'INVALID_SIDE'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'INVALID_QUANTITY'; end if;
  if p_quoted_price is null or p_quoted_price <= 0 or p_execution_price is null or p_execution_price <= 0 then raise exception 'INVALID_PRICE'; end if;
  if p_fee is null or p_fee < 0 then raise exception 'INVALID_FEE'; end if;

  select * into v_profile from public.profiles where id = p_user_id for update;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;
  select * into v_order from public.orders where user_id = p_user_id and client_order_id = p_client_order_id;
  if found then return v_order; end if;
  perform 1 from public.stocks where symbol = upper(p_symbol) and is_active = true;
  if not found then raise exception 'STOCK_NOT_FOUND'; end if;

  v_trade_value := round(p_quantity * p_execution_price, 2);
  if p_side = 'buy' then
    if v_profile.cash_balance < v_trade_value + p_fee then raise exception 'INSUFFICIENT_CASH'; end if;
    select * into v_holding from public.holdings where user_id = p_user_id and symbol = upper(p_symbol);
    if found then
      v_new_avg := round((v_holding.quantity * v_holding.avg_cost + p_quantity * p_execution_price) / (v_holding.quantity + p_quantity), 4);
      update public.holdings set quantity = quantity + p_quantity, avg_cost = v_new_avg where user_id = p_user_id and symbol = upper(p_symbol);
    else
      insert into public.holdings (user_id, symbol, quantity, avg_cost)
      values (p_user_id, upper(p_symbol), p_quantity, round(p_execution_price, 4));
    end if;
    -- Recognize the fee once, now, rather than embedding it in share cost.
    v_realized := -p_fee;
    update public.profiles set cash_balance = cash_balance - v_trade_value - p_fee,
      realized_pl = realized_pl + v_realized where id = p_user_id;
  else
    select * into v_holding from public.holdings where user_id = p_user_id and symbol = upper(p_symbol);
    if not found or v_holding.quantity < p_quantity then raise exception 'INSUFFICIENT_SHARES'; end if;
    v_realized := round((p_execution_price - v_holding.avg_cost) * p_quantity - p_fee, 2);
    v_remaining := v_holding.quantity - p_quantity;
    if v_remaining < 0.000001 then
      delete from public.holdings where user_id = p_user_id and symbol = upper(p_symbol);
    else
      update public.holdings set quantity = v_remaining where user_id = p_user_id and symbol = upper(p_symbol);
    end if;
    update public.profiles set cash_balance = cash_balance + v_trade_value - p_fee,
      realized_pl = realized_pl + v_realized where id = p_user_id;
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

revoke all on function public.execute_trade(uuid, uuid, text, text, numeric, numeric, numeric, numeric) from public, anon, authenticated;
grant execute on function public.execute_trade(uuid, uuid, text, text, numeric, numeric, numeric, numeric) to service_role;

create temporary table trade_cost_replay (
  user_id uuid not null,
  session_id uuid not null,
  symbol text not null,
  quantity numeric(18,6) not null,
  avg_cost numeric(18,4) not null,
  primary key (user_id, session_id, symbol)
) on commit drop;

do $$
declare
  v_order record;
  v_state record;
  v_qty numeric(18,6);
  v_avg numeric(18,4);
  v_realized numeric(18,2);
begin
  for v_order in select * from public.orders order by created_at, id loop
    select quantity, avg_cost into v_state from trade_cost_replay
      where user_id = v_order.user_id and session_id = v_order.portfolio_session_id and symbol = v_order.symbol;
    v_qty := coalesce(v_state.quantity, 0);
    v_avg := coalesce(v_state.avg_cost, 0);
    if v_order.side = 'buy' then
      v_avg := round((v_qty * v_avg + v_order.quantity * v_order.price) / (v_qty + v_order.quantity), 4);
      v_qty := v_qty + v_order.quantity;
      v_realized := -v_order.fee;
    else
      if v_qty < v_order.quantity then raise exception 'Trade cost migration: incomplete order history for %', v_order.id; end if;
      v_realized := round((v_order.price - v_avg) * v_order.quantity - v_order.fee, 2);
      v_qty := v_qty - v_order.quantity;
      if v_qty = 0 then v_avg := 0; end if;
    end if;
    insert into trade_cost_replay values (v_order.user_id, v_order.portfolio_session_id, v_order.symbol, v_qty, v_avg)
    on conflict (user_id, session_id, symbol) do update set quantity = excluded.quantity, avg_cost = excluded.avg_cost;
    update public.orders set realized_pl = v_realized where id = v_order.id;
  end loop;

  -- Never guess a cost or alter share counts when the ledger is incomplete.
  if exists (
    select 1 from public.holdings h join public.profiles p on p.id = h.user_id
    left join trade_cost_replay r on r.user_id = h.user_id and r.session_id = p.current_session_id and r.symbol = h.symbol
    where r.quantity is null or r.quantity <> h.quantity
  ) or exists (
    select 1 from trade_cost_replay r join public.profiles p on p.id = r.user_id and p.current_session_id = r.session_id
    left join public.holdings h on h.user_id = r.user_id and h.symbol = r.symbol
    where r.quantity > 0 and h.user_id is null
  ) then raise exception 'Trade cost migration: holdings do not match order history; no changes committed'; end if;
end;
$$;

update public.holdings h set avg_cost = r.avg_cost
from trade_cost_replay r, public.profiles p
where p.id = h.user_id and r.user_id = h.user_id and r.symbol = h.symbol and r.session_id = p.current_session_id;

update public.profiles p set realized_pl = coalesce((
  select sum(o.realized_pl) from public.orders o where o.user_id = p.id and o.portfolio_session_id = p.current_session_id
), 0);

commit;
