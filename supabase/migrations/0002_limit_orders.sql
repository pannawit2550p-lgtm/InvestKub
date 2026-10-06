create table if not exists public.limit_orders (
  id uuid primary key default gen_random_uuid(),
  client_order_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  symbol text not null references public.stocks(symbol),
  side text not null check (side in ('buy', 'sell')),
  quantity numeric(18,6) not null check (quantity > 0),
  limit_price numeric(18,4) not null check (limit_price > 0),
  status text not null default 'pending' check (status in ('pending', 'processing', 'filled', 'expired', 'failed', 'cancelled')),
  market_opens_at timestamptz not null,
  expires_at timestamptz not null,
  quoted_price numeric(18,4),
  execution_price numeric(18,4),
  fee numeric(18,2),
  filled_order_id uuid references public.orders(id) on delete set null,
  failure_code text,
  failure_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, client_order_id),
  check (expires_at > market_opens_at)
);

create index if not exists limit_orders_user_created_idx
  on public.limit_orders (user_id, created_at desc);
create index if not exists limit_orders_pending_idx
  on public.limit_orders (status, expires_at)
  where status in ('pending', 'processing');

alter table public.limit_orders enable row level security;

drop policy if exists limit_orders_select_own on public.limit_orders;
create policy limit_orders_select_own
  on public.limit_orders for select
  using (auth.uid() = user_id);

grant select on table public.limit_orders to authenticated;
revoke insert, update, delete on table public.limit_orders from anon, authenticated;

-- Make the new table available to PostgREST immediately after this migration runs.
notify pgrst, 'reload schema';
